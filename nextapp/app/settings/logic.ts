import type { ReleaseGroupsResponse, StatusResponse } from "@/lib/api-types";

// How often the Settings page reloads: every 2 s while anything is under
// way, every 15 s otherwise (to notice a scheduled sync starting). Under
// way: a "Sync now" here (busy), any stage running (on schedule, at boot,
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
    (groups !== null && (groups.matching || groups.Items.some((g) => g.syncing || !g.complete)));
  return running ? FAST_POLL_MS : SLOW_POLL_MS;
}
