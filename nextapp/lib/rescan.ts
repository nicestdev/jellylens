import { JELLYFIN_API_KEY, JELLYFIN_URL } from "./env";
import { refreshLibraries } from "./jellyfin";
import { startByHand } from "./sync-manager";

// The library scan after a move: Jellylens scans the disks, and Jellyfin is asked to scan its
// libraries too, so it plays what came in (it does that on its own; a
// Jellyfin that can't be reached doesn't hold the scan up).
export function rescan() {
  if (JELLYFIN_URL && JELLYFIN_API_KEY) {
    refreshLibraries(JELLYFIN_URL, JELLYFIN_API_KEY).catch((e) =>
      console.error("[rescan] Jellyfin refresh failed:", (e as Error).message),
    );
  }
  // Fresh: a scan already running may have listed the disks before the move.
  startByHand("library", true);
}
