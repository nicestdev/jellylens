import type { IgnoreEntry, ReleaseGroupsResponse, ShowItem, StatusResponse } from "@/lib/api-types";
import { showName } from "@/lib/format";

// How often the Settings page reloads: every 2 s while anything is under
// way, every 15 s otherwise (to notice a scheduled sync starting). Under
// way: a "Sync" here (busy), any stage running (on schedule, at boot,
// or the releases sync that adding a group started), the releases sync
// checking titles on TMDB, or a group whose releases are still loading.
export const FAST_POLL_MS = 2000;
export const SLOW_POLL_MS = 15000;

export function pollDelay({
  busy,
  status,
  groups,
}: {
  busy: boolean;
  status: StatusResponse | null;
  groups: ReleaseGroupsResponse | null;
}): number {
  const running =
    busy ||
    (status !== null && Object.values(status).some((s) => s.running)) ||
    (groups !== null && (groups.matching || groups.items.some((g) => g.syncing || !g.complete)));
  return running ? FAST_POLL_MS : SLOW_POLL_MS;
}

// The last columns of the two group tables, the same widths so they line
// up: Releases, Last sync, the button.
export const SETTINGS_COLUMNS = { middle: "w-32", lastSync: "w-24", action: "w-12" };

// Ignored Settings lists: the ignored shows, each with its name and year,
// by name.
export function ignoredList(shows: ShowItem[], ignored: IgnoreEntry[]) {
  const byId = new Map(shows.map((s) => [s.id, s]));
  return ignored
    .map((entry) => ({ entry, name: showName(byId.get(entry.showId)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
