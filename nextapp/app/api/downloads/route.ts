import fs from "fs";
import type { DownloadsResponse } from "@/lib/api-types";
import { libraryOf } from "@/lib/download-library";
import { DDOWNLOAD_LOGIN, DDOWNLOAD_PASSWORD, DOWNLOAD_DIR, REALDEBRID_TOKEN } from "@/lib/env";
import { decryptDlc } from "@/lib/dlc";
import { nameFromUrl, routeOf } from "@/lib/hosters";
import { checkPendingFiles, matchPendingPackages, onlineOf } from "@/lib/download-match";
import { kickDownloads, liveProgress, packageDir, packageOutputs, pauseAllDownloads } from "@/lib/downloader";
import {
  MAX_DOWNLOAD_SLOTS,
  addPackage,
  getDownloadSettings,
  listFiles,
  listPackages,
  setDownloadSettings,
} from "@/lib/store";

// How a link would be fetched now ("ddownload", "rapidgator.net via
// Real-Debrid"), null if nothing can.
async function routeLabel(url: string): Promise<string | null> {
  try {
    return (await routeOf(url))?.label ?? null;
  } catch {
    return null; // Real-Debrid's hoster list didn't load
  }
}

// Free bytes where packages go, null if it can't be read.
function freeSpace(): number | null {
  try {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    const s = fs.statfsSync(DOWNLOAD_DIR);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

async function downloads(): Promise<DownloadsResponse> {
  const live = liveProgress();
  const files = Map.groupBy(listFiles(), (f) => f.packageId);
  const packages = listPackages();
  // Posters and titles, and new files' names and sizes, fill in on a later
  // load.
  matchPendingPackages();
  checkPendingFiles();
  // Where an unfinished package's files come from.
  const sources = new Map<number, string[]>();
  for (const pkg of packages) {
    if (pkg.status === "done") continue;
    const labels = await Promise.all((files.get(pkg.id) ?? []).map((f) => routeLabel(f.url)));
    sources.set(pkg.id, [...new Set(labels.map((l) => l ?? "no account"))]);
  }
  return {
    ready: Boolean((DDOWNLOAD_LOGIN && DDOWNLOAD_PASSWORD) || REALDEBRID_TOKEN),
    downloadDir: DOWNLOAD_DIR,
    freeBytes: freeSpace(),
    slots: getDownloadSettings().slots,
    maxSlots: MAX_DOWNLOAD_SLOTS,
    packages: packages.map((pkg) => {
      const pkgFiles = files.get(pkg.id) ?? [];
      const { library, owned } =
        pkg.status === "done" ? { library: null, owned: new Set<number>() } : libraryOf(pkg, pkgFiles);
      return {
        ...pkg,
        library,
        sources: sources.get(pkg.id) ?? [],
        outputs: pkg.status === "done" ? packageOutputs(pkg) : [],
        extractPercent: live.extracting.get(pkg.id) ?? null,
        files: pkgFiles.map(({ packageId: _p, ...f }) => ({
          ...f,
          speed: live.speed.get(f.id) ?? null,
          inLibrary: owned.has(f.id),
          checked: onlineOf(f.id),
        })),
      };
    }),
  };
}

// GET /api/downloads — the Downloads page; admin only (proxy.ts).
export async function GET() {
  return Response.json((await downloads()) satisfies DownloadsResponse);
}

// PATCH { paused?: boolean, slots?: number, passwords?: string[] } — Pause
// all (every waiting or downloading package) or Resume all (every paused
// one); how many files come in at once (1 to MAX_DOWNLOAD_SLOTS; fewer
// takes effect as running ones finish); the archive passwords, in the
// order they're tried (blank and repeated ones dropped).
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { paused, slots, passwords } = body ?? {};
  const validSlots = Number.isInteger(slots) && (slots as number) >= 1 && (slots as number) <= MAX_DOWNLOAD_SLOTS;
  const validPasswords =
    Array.isArray(passwords) &&
    passwords.length <= 100 &&
    passwords.every((p) => typeof p === "string" && p.length <= 200);
  if (
    !body ||
    (paused !== undefined && typeof paused !== "boolean") ||
    (slots !== undefined && !validSlots) ||
    (passwords !== undefined && !validPasswords) ||
    (paused === undefined && slots === undefined && passwords === undefined)
  ) {
    return Response.json(
      {
        error: `Expected { paused?: boolean, slots?: 1–${MAX_DOWNLOAD_SLOTS}, passwords?: string[] }.`,
      },
      { status: 400 },
    );
  }
  if (passwords !== undefined) {
    setDownloadSettings({ passwords: [...new Set((passwords as string[]).map((p) => p.trim()).filter(Boolean))] });
  }
  if (slots !== undefined) {
    setDownloadSettings({ slots: slots as number });
    kickDownloads();
  }
  if (typeof paused === "boolean") pauseAllDownloads(paused);
  return Response.json((await downloads()) satisfies DownloadsResponse);
}

const NO_ACCOUNT = "No account for its hoster";

const fileBase = (name: string) => name.replace(/\.[^.]+$/, "");

type NewPackage = {
  name: string;
  files: { url: string; name: string; size: number | null }[];
};

// POST multipart: `containers` (.dlc files), `links` (one per line, one
// package; archive passwords: Settings', then ARCHIVE_PASSWORDS). Adds a package per
// container package, pending: nothing downloads until it's started
// (POST /api/downloads/<id>). A link of a hoster we can't fetch stays in
// as a failed file, so its package says so; one with nothing to fetch isn't added.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected a form with DLC files or links." }, { status: 400 });
  }
  const packages: NewPackage[] = [];

  for (const entry of form.getAll("containers")) {
    if (!(entry instanceof File)) continue;
    try {
      const found = await decryptDlc(await entry.text());
      for (const p of found) {
        packages.push({
          name: p.name || fileBase(entry.name),
          files: p.files.map((f) => ({
            url: f.url,
            name: f.name || nameFromUrl(f.url),
            size: f.size,
          })),
        });
      }
    } catch (e) {
      return Response.json({ error: `${entry.name}: ${(e as Error).message}` }, { status: 400 });
    }
  }

  const links = String(form.get("links") ?? "")
    .split(/\s+/)
    .filter((l) => /^https?:\/\//i.test(l) && URL.canParse(l));
  if (links.length) {
    const first = nameFromUrl(links[0]).replace(/\.part\d+\.rar$|\.(rar|zip|7z)$/i, "");
    packages.push({
      name: first,
      files: links.map((url) => ({ url, name: nameFromUrl(url), size: null })),
    });
  }

  let added = 0;
  let unfetchable = 0;
  for (const p of packages) {
    const fetchable = await Promise.all(p.files.map(async (f) => Boolean(await routeLabel(f.url))));
    if (!fetchable.some(Boolean)) {
      unfetchable++;
      continue;
    }
    const files = p.files.map((f, i) => (fetchable[i] ? f : { ...f, error: NO_ACCOUNT }));
    addPackage({ name: p.name, dir: packageDir(p.name), files });
    added++;
  }
  if (!added) {
    return Response.json(
      {
        error: unfetchable
          ? "None of the links can be fetched: there's no account for their hoster, and Real-Debrid doesn't cover it (or isn't set up)."
          : "No links found.",
      },
      { status: 400 },
    );
  }
  return Response.json((await downloads()) satisfies DownloadsResponse);
}
