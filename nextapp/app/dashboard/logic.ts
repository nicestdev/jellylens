import type {
  DownloadPackageItem,
  IgnoreEntry,
  MissingSeason,
  OrganizeDisk,
  OrganizeItem,
  OrganizeMoved,
  RequestItem,
  ShowItem,
} from "@/lib/api-types";
import { partCheck, STATUS_LABEL, summarize, type Section } from "@/app/queue/logic";

// What the Dashboard shows, worked out from the routes' data. No React
// here, so it's tested on its own.

// A show with episodes missing (not ignored): its seasons with gaps, and
// how many episodes that is in all.
export type MissingShow = { item: ShowItem; seasons: MissingSeason[]; count: number };

// Every show with something missing, finished seasons or airing ones,
// most missing first, then by name.
export function missingShows(shows: ShowItem[], ignored: IgnoreEntry[]): MissingShow[] {
  const off = new Set(ignored.map((e) => e.showId));
  return shows
    .filter((item) => !off.has(item.id))
    .map((item) => {
      const seasons = [...(item.missingEpisodes?.seasons ?? [])].sort((a, b) => a.season - b.season);
      return { item, seasons, count: seasons.reduce((sum, s) => sum + s.count, 0) };
    })
    .filter((m) => m.seasons.length > 0)
    .sort((a, b) => b.count - a.count || a.item.name.localeCompare(b.item.name));
}

// The wishlist's open titles (not in the library yet), latest added first.
export const openWishlist = (items: RequestItem[]) =>
  items.filter((r) => !r.library).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

// Share of a disk that's free; 1 when its size isn't known.
export const freeShare = (d: OrganizeDisk) => (d.totalBytes ? (d.freeBytes ?? 0) / d.totalBytes : 1);
// Under 5 % free: red.
export const diskLow = (d: OrganizeDisk) => freeShare(d) < 0.05;
export const totalFree = (disks: OrganizeDisk[]) => disks.reduce((sum, d) => sum + (d.freeBytes ?? 0), 0);

// What was moved into the library in the last 7 days, newest first.
export const recentImports = (moved: OrganizeMoved[], now = Date.now()) =>
  moved
    .filter((m) => now - new Date(m.movedAt).getTime() <= 7 * 24 * 3600_000)
    .sort((a, b) => b.movedAt.localeCompare(a.movedAt));

// The Queue box's rows, from the Queue's sections (Done left out): each
// title and where it's at, the details being the Queue's. Error
// (red) for any failure; Needs attention (peach) for a new one that waits for a
// hand before its download (the library has some of it, or no TMDB match);
// what runs and how far (a download's state, Moving, Verifying), colored
// like the Queue's Status column; Ready to organize.
export type QueueTone = "error" | "warning" | "success" | "info";
export type QueueRow = {
  key: string;
  pkg: Pick<DownloadPackageItem, "media" | "name">;
  line: string[];
  tone?: QueueTone;
};

const percent = (fraction: number) => `${Math.floor(Math.min(1, fraction) * 100)}\u202f%`;
const FAILED = { line: ["Error"], tone: "error" as const };

export function queueRows(parts: Section[]): QueueRow[] {
  return parts.flatMap((part) => [
    ...part.packages.map((p) => ({ key: `p${p.id}`, pkg: p, ...packageNote(p) })),
    ...part.items.map((i) => ({ key: `i${i.id}`, pkg: i, ...itemNote(i) })),
    ...part.pending.flatMap((p) => {
      const note = pendingNote(p);
      return note ? [{ key: `p${p.id}`, pkg: p, ...note }] : [];
    }),
  ]);
}

function packageNote(pkg: DownloadPackageItem): { line: string[]; tone?: QueueTone } {
  if (pkg.status === "failed") return FAILED;
  const tone = pkg.status === "downloading" ? "success" : pkg.status === "extracting" ? "info" : undefined;
  return { line: [STATUS_LABEL[pkg.status] ?? "", percent(summarize(pkg).fraction)], tone };
}

function itemNote(item: OrganizeItem): { line: string[]; tone?: QueueTone } {
  const move = item.move;
  if (item.error || move?.error) return FAILED;
  if (!move) return { line: ["Ready to organize"] };
  const done = percent(move.total ? move.done / move.total : 0);
  if (!move.running) return { line: ["Waiting", done] };
  return move.phase === "copying"
    ? { line: ["Moving", done], tone: "success" }
    : { line: ["Verifying", done], tone: "info" };
}

// A new one starts by itself when the library has nothing of it
// (startIfNew), so one that waits has a part that can't be fetched or is
// missing (Error), or needs a hand (Needs attention). Left out while its parts are
// checked, or when it only waits for a hoster's answer.
export function pendingNote(pkg: DownloadPackageItem): { line: string[]; tone: QueueTone } | null {
  const check = partCheck(pkg);
  if (check.tone === "error") return FAILED;
  if (check.checking) return null;
  return !pkg.media || pkg.library ? { line: ["Needs attention"], tone: "warning" } : null;
}
