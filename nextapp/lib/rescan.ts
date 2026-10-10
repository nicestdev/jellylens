import { JELLYFIN_API_KEY, JELLYFIN_URL } from "./env";
import { refreshLibraries } from "./jellyfin";
import { scanProgress } from "./library-scan";
import { startByHand, triggerLibraryScan } from "./sync-manager";
import type { OrganizeScan } from "./api-types";

// The library scan started from the Organize page (Rescan) or after a move
// or Undo: Jellylens scans the disks, and Jellyfin is asked to scan its
// libraries too, so it plays what came in (it does that on its own; a
// Jellyfin that can't be reached doesn't hold the scan up).
export function rescan() {
  if (JELLYFIN_URL && JELLYFIN_API_KEY) {
    refreshLibraries(JELLYFIN_URL, JELLYFIN_API_KEY).catch((e) =>
      console.error("[rescan] Jellyfin refresh failed:", (e as Error).message),
    );
  }
  startByHand("library");
}

// Whether the scan runs, and how far its probing is (null otherwise).
export function scanState(): OrganizeScan {
  const p = scanProgress();
  return {
    running: triggerLibraryScan.running(),
    percent: p?.phase === "probing" && p.total ? (p.done / p.total) * 100 : null,
  };
}
