import type { IgnoreEntry, MissingSeason, OrganizeDisk, OrganizeMoved, RequestItem, ShowItem } from "@/lib/api-types";

// What the Dashboard shows, worked out from the routes' data. No React
// here, so it's tested on its own.

// A show with episodes missing: its seasons with gaps (not ignored), and
// how many episodes that is in all.
export type MissingShow = { item: ShowItem; seasons: MissingSeason[]; count: number };

function isIgnored(ignored: IgnoreEntry[], showId: string, season: number): boolean {
  return ignored.some((e) => e.showId === showId && (e.season === null || e.season === season));
}

// Every show with something missing, finished seasons or airing ones,
// most missing first, then by name.
export function missingShows(shows: ShowItem[], ignored: IgnoreEntry[]): MissingShow[] {
  return shows
    .map((item) => {
      const seasons = (item.missingEpisodes?.seasons ?? [])
        .filter((s) => !isIgnored(ignored, item.id, s.season))
        .sort((a, b) => a.season - b.season);
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
