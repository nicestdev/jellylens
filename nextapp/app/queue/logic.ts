import type { DownloadPackageItem, OrganizeItem, OrganizeMoved, OrganizeResponse } from "@/lib/api-types";
import { formatBytes, plural } from "@/lib/format";
import { parseReleaseName } from "@/lib/title-match";

// What a package row shows, worked out from its files.
type PackageSummary = {
  received: number;
  // Known only once every file's size is (the hoster tells as each starts).
  total: number | null;
  // The total with the sizes not known yet taken as the known ones'
  // average (a release's parts are the same size); null if none is known.
  estimate: number | null;
  // 0–1, for the bar: bytes of the estimate, else files done.
  fraction: number;
  speed: number;
};

export function summarize(pkg: DownloadPackageItem): PackageSummary {
  // Skipped parts don't count.
  pkg = { ...pkg, files: pkg.files.filter((f) => f.status !== "skipped") };
  const received = pkg.files.reduce((n, f) => n + f.received, 0);
  const sized = pkg.files.filter((f) => f.size);
  const known = sized.reduce((n, f) => n + (f.size ?? 0), 0);
  const total = sized.length === pkg.files.length ? known : null;
  const estimate = sized.length ? Math.max(received, (known / sized.length) * pkg.files.length) : null;
  const doneFiles = pkg.files.filter((f) => f.status === "done" || f.status === "extracted").length;
  const speed = pkg.files.reduce((n, f) => n + (f.speed ?? 0), 0);
  const fraction =
    pkg.status === "extracting"
      ? (pkg.extractPercent ?? 0) / 100
      : pkg.status === "done"
        ? 1
        : estimate
          ? received / estimate
          : pkg.files.length
            ? doneFiles / pkg.files.length
            : 0;
  return { received, total, estimate, fraction: Math.min(1, fraction), speed };
}

export const formatSpeed = (bytesPerSecond: number) => `${formatBytes(bytesPerSecond)}/s`;

// "3 min", "1 h 12 min" left at the current speed.
export function timeLeft(remaining: number, speed: number): string | null {
  if (speed <= 0 || remaining <= 0) return null;
  const minutes = Math.ceil(remaining / speed / 60);
  if (minutes < 60) return `${minutes}\u202fmin`;
  return `${Math.floor(minutes / 60)}\u202fh ${minutes % 60}\u202fmin`;
}

// A moving package's state, the first part of its Status line over the bar
// (a new or failed one says something else there, a finished one is a
// Ready to organize row).
export const STATUS_LABEL: Partial<Record<DownloadPackageItem["status"], string>> = {
  queued: "Waiting",
  downloading: "Loading",
  paused: "Paused",
  extracting: "Extracting",
};

// "Name - uploader" without the uploader.
export const releaseName = (name: string) => name.replace(/\s+-\s+[^.]+$/, "").trim();

// The title shown: TMDB's, else the one in the release name.
export function displayName(pkg: Pick<DownloadPackageItem, "media" | "name">): { title: string; year: number | null } {
  if (pkg.media) return { title: pkg.media.title, year: pkg.media.year };
  const parsed = parseReleaseName(releaseName(pkg.name).replace(/\.S\d{1,2}(?:[+-]S?\d{1,2})+(?=\.)/i, ".S01"));
  return { title: parsed.title || pkg.name, year: parsed.year };
}

// The line above the list: the speed now, what's left to download and
// how long at this speed, while anything comes in or waits to; the free
// space in DOWNLOAD_DIR always. Each a number and, if it needs one, a word
// after it: "120.74 MB/s · 36.41 GB left · 6 min · 756.61 GB free".
type QueueStat = { value: string; word?: string };
export function queueLine(data: { packages: DownloadPackageItem[]; freeBytes: number | null }): QueueStat[] {
  const { packages } = data;
  const speed = packages.reduce((n, p) => n + p.files.reduce((m, f) => m + (f.speed ?? 0), 0), 0);
  let left = 0;
  for (const p of packages) {
    if (p.status !== "downloading" && p.status !== "queued" && p.status !== "paused") continue;
    for (const f of p.files)
      if (f.status === "queued" || f.status === "downloading") left += Math.max(0, (f.size ?? 0) - f.received);
  }
  const eta = timeLeft(left, speed);
  return [
    ...(speed ? [{ value: formatSpeed(speed) }] : []),
    ...(left ? [{ value: formatBytes(left), word: "left" }] : []),
    ...(eta ? [{ value: eta }] : []),
    { value: data.freeBytes !== null ? formatBytes(data.freeBytes) : "?", word: "free" },
  ];
}

// What Pause all and Resume all would act on.
export const canPauseAll = (packages: DownloadPackageItem[]) =>
  packages.some((p) => p.status === "queued" || p.status === "downloading");
export const canResumeAll = (packages: DownloadPackageItem[]) => packages.some((p) => p.status === "paused");

// Fast polling while anything moves.
export const isActive = (packages: DownloadPackageItem[]) =>
  packages.some((p) => p.status === "queued" || p.status === "downloading" || p.status === "extracting");

// The page in parts, empty ones left out, a package in one of them from
// when it comes in to when it's in the library: Needs attention (what
// failed first: downloads, moves and finished ones that can't be moved;
// then new ones waiting for a start, pending), Downloading (in queue order, by when they were
// started), Ready to organize (finished, to move, also while they move)
// and Done (in the library, newest first). Without /api/organize's answer
// yet, only the packages'.
export type SectionTitle = "Needs attention" | "Downloading" | "Ready to organize" | "Done";
export type Section = {
  title: SectionTitle;
  packages: DownloadPackageItem[];
  items: OrganizeItem[];
  moved: OrganizeMoved[];
  pending: DownloadPackageItem[];
};
export function sections(packages: DownloadPackageItem[], organize: OrganizeResponse | null): Section[] {
  const byStart = (a: DownloadPackageItem, b: DownloadPackageItem) =>
    (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt) || a.id - b.id;
  const items = organize?.items ?? [];
  const moved = organize?.moved ?? [];
  const stuck = (i: { move: OrganizeItem["move"] }) => Boolean(i.move?.error);
  const list: Section[] = [
    {
      title: "Needs attention",
      packages: packages.filter((p) => p.status === "failed").sort(byStart),
      items: items.filter((i) => i.error || stuck(i)),
      moved: moved.filter(stuck),
      pending: packages.filter((p) => p.status === "pending").sort(byStart),
    },
    {
      title: "Downloading",
      packages: packages
        .filter((p) => p.status !== "done" && p.status !== "failed" && p.status !== "pending")
        .sort(byStart),
      items: [],
      moved: [],
      pending: [],
    },
    {
      title: "Ready to organize",
      packages: [],
      items: items.filter((i) => !i.error && !stuck(i)),
      moved: [],
      pending: [],
    },
    { title: "Done", packages: [], items: [], moved: moved.filter((m) => !stuck(m)), pending: [] },
  ];
  return list.filter((s) => sizeOf(s));
}
export const sizeOf = (s: Section) => s.packages.length + s.items.length + s.moved.length + s.pending.length;

// A failure for its row (a package's or a move's): the first line's reason
// without its file name (a failed file's or the archive's, "name:
// reason"), as a sentence starts and without its closing period, "+N" for
// any more (the Status line shows it whole on hover only when it's cut).
export function errorLine(error: string | null): string {
  const lines = (error ?? "").split("\n").filter(Boolean);
  if (!lines.length) return "Failed";
  const reason = lines[0].replace(/^[^:]*: /, "").replace(/\.$/, "");
  const first = reason.charAt(0).toUpperCase() + reason.slice(1);
  return lines.length > 1 ? `${first} +${lines.length - 1}` : first;
}

// A new package's parts before it's started, for its Status: Checking
// while the hoster is asked about them (lib/download-match.ts); then how
// many are online of how many there should be (gaps in a multi-part RAR's
// numbering count; it can't be extracted then); red when one is missing,
// peach when the hoster didn't answer for one. One that failed (offline, or
// no account for its hoster) says why instead, red, and how many ("No
// account for its hoster · 2 parts"; "+1" for another reason).
export function partCheck(pkg: DownloadPackageItem): { line: string; tone?: "error" | "warning" } {
  const parts = pkg.files.filter((f) => f.status !== "skipped");
  const open = parts.filter((f) => f.status === "queued");
  const asked = open.filter((f) => f.checked !== null).length;
  if (asked < open.length) return { line: `Checking · ${asked}/${open.length}` };
  const offline = parts.filter((f) => f.status === "failed");
  if (offline.length) {
    const reasons = [...new Set(offline.map((f) => errorLine(f.error)))];
    const more = reasons.length > 1 ? ` +${reasons.length - 1}` : "";
    return { line: `${reasons[0]}${more} · ${plural(offline.length, "part")}`, tone: "error" };
  }
  const unknown = open.filter((f) => f.checked !== "online");
  const sets = new Map<string, Set<number>>();
  for (const f of parts) {
    const m = /^(.*)\.part(\d+)\.rar$/i.exec(f.name);
    if (!m) continue;
    const key = m[1].toLowerCase();
    sets.set(key, (sets.get(key) ?? new Set()).add(Number(m[2])));
  }
  const missing: string[] = [];
  for (const nums of sets.values())
    for (let n = 1; n <= Math.max(...nums); n++) if (!nums.has(n)) missing.push(`part${n}`);
  // Missing parts count as parts too, so a gap shows in the numbers.
  const line = `Online · ${open.length - unknown.length}/${parts.length + missing.length}`;
  const tone = missing.length ? "error" : unknown.length ? "warning" : undefined;
  return { line, tone };
}
