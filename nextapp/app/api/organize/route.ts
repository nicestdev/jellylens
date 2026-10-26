import fs from "fs";
import path from "path";
import type { OrganizeDisk, OrganizeItem, OrganizeResponse } from "@/lib/api-types";
import { LIBRARY_DIR } from "@/lib/env";
import { libraryTargets, moveIds, moveOf, movePlan, ownedFiles, startMove } from "@/lib/library-move";
import { deletePackage, getPackage, listPackages, type DownloadPackage } from "@/lib/store";
import { log } from "@/lib/log";

// The library's disks (LIBRARY_DIR's folders) with their free and total
// bytes; [] if it's unset or unreadable.
function disks(): OrganizeDisk[] {
  if (!LIBRARY_DIR) return [];
  try {
    return fs
      .readdirSync(LIBRARY_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .map((disk) => {
        try {
          const s = fs.statfsSync(path.join(LIBRARY_DIR, disk));
          return { disk, freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
        } catch {
          return { disk, freeBytes: null, totalBytes: null };
        }
      });
  } catch {
    return [];
  }
}

// What a moved package's files take in the library now (0 for any gone).
function movedBytes(folder: string, files: { to: string }[]): number {
  let bytes = 0;
  for (const f of files)
    try {
      bytes += fs.statSync(path.join(LIBRARY_DIR, folder, f.to)).size;
    } catch {
      // moved or deleted since
    }
  return bytes;
}

// A package in New, with what the library has of it already (slow over
// sshfs: it reads the title's folders).
async function itemOf(pkg: DownloadPackage): Promise<OrganizeItem> {
  const plan = movePlan(pkg);
  return {
    id: pkg.id,
    name: pkg.name,
    media: pkg.media,
    folder: plan.folder,
    files: plan.files.map((f) => f.to),
    bytes: plan.bytes,
    error: plan.error,
    targets: plan.error ? [] : libraryTargets(pkg),
    owned: await ownedFiles(pkg, plan),
    move: moveOf(pkg.id),
  };
}

const done = () => listPackages().filter((p) => p.status === "done");

async function organizePage(): Promise<OrganizeResponse> {
  const found = disks();
  const first = await Promise.all(
    done()
      .filter((p) => !p.movedTo)
      .map(itemOf),
  );
  // Read again after those awaits: a move that ended meanwhile has its
  // files in the library already, so its package would show as New, owned
  // by itself; one deleted meanwhile is gone.
  const packages = done();
  const waiting = packages.filter((p) => !p.movedTo);
  const known = new Map(first.map((i) => [i.id, i]));
  const items = await Promise.all(waiting.map((p) => known.get(p.id) ?? itemOf(p)));
  return {
    ready: found.length > 0,
    libraryDir: LIBRARY_DIR,
    disks: found,
    items,
    moved: packages
      .filter((p) => p.movedTo)
      .map((p) => ({
        id: p.id,
        name: p.name,
        media: p.media,
        movedTo: p.movedTo!,
        movedAt: p.movedAt!,
        files: (p.movedFiles ?? []).map((f) => f.to),
        bytes: movedBytes(p.movedTo!, p.movedFiles ?? []),
        replaced: p.replaced,
      }))
      .sort((a, b) => b.movedAt.localeCompare(a.movedAt)),
  };
}

// While moves are queued the Queue asks every second, and reading the
// library over sshfs shares the line with the copy (a move at half speed):
// the folders are read at most every 10 s then, the moves' progress every
// time, and at once when a move or package comes, goes or ends.
const globalForOrganize = globalThis as unknown as {
  __organizePage?: { key: string; at: number; page: OrganizeResponse };
};

async function pollPage(): Promise<OrganizeResponse> {
  const moving = moveIds();
  if (!moving.length) return organizePage();
  const key = moving.join() + "|" + listPackages().map((p) => `${p.id}:${p.status}:${p.movedTo ?? ""}`);
  const kept = globalForOrganize.__organizePage;
  const page =
    kept && kept.key === key && Date.now() - kept.at < 10_000
      ? kept.page
      : (globalForOrganize.__organizePage = { key, at: Date.now(), page: await organizePage() }).page;
  return { ...page, items: page.items.map((i) => ({ ...i, move: moveOf(i.id) })) };
}

// GET /api/organize — the Queue's Ready to organize and Done; admin only (proxy.ts).
export async function GET() {
  return Response.json((await pollPage()) satisfies OrganizeResponse);
}

// POST { id, target } — moves a finished package into the library folder
// target (one of its targets' paths), in the background; one the library
// has already needs replace: true (Replace; one version of everything,
// so there's no adding it as another). Answers with the page.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const pkg = Number.isInteger(body?.id) ? getPackage(body.id) : null;
  if (!pkg) return Response.json({ error: "No such package." }, { status: 404 });
  if (typeof body.target !== "string") return Response.json({ error: "Expected { id, target }." }, { status: 400 });
  const replace = body.replace === true ? true : undefined;
  const error = await startMove(pkg, body.target, replace);
  if (error) return Response.json({ error }, { status: 409 });
  return Response.json((await organizePage()) satisfies OrganizeResponse);
}

// DELETE — clears Done: forgets the packages moved into the library (their
// files are there, their download folders gone already); answers with the
// page.
export async function DELETE() {
  const done = listPackages().filter((p) => p.movedTo);
  for (const p of done) deletePackage(p.id);
  log.info("organize", `Cleared ${done.length} done`);
  return Response.json((await organizePage()) satisfies OrganizeResponse);
}
