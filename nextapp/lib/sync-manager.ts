import { libraryCounts, syncedAt, tmdbPosterPaths } from "./store";
import { notify } from "./events";
import { plural } from "./format";
import { scanLibrary } from "./library-scan";
import { syncTmdb } from "./sync-tmdb";
import { computeMissing } from "./compute-missing";
import { syncReleases } from "./sync-releases";
import { makeTrigger, setSchedule } from "./scheduler";
import { pruneTmdbImages } from "./tmdb-image-cache";
import {
  TMDB_API_KEY,
  TMDB_LANGUAGE,
  LIBRARY_SCAN_INTERVAL_HOURS,
  TMDB_SYNC_INTERVAL_HOURS,
  MISSING_RECHECK_INTERVAL_HOURS,
  XREL_SYNC_INTERVAL_HOURS,
} from "./env";

export const triggerMissingRecheck = makeTrigger("missing-recheck", async () => computeMissing());

export const triggerLibraryScan = makeTrigger("library-scan", async () => {
  const tmdb = TMDB_API_KEY ? { apiKey: TMDB_API_KEY, language: TMDB_LANGUAGE } : null;
  const result = await scanLibrary(tmdb);
  pruneTmdbPosters();
  // What just arrived is no longer missing; the recheck needs no network,
  // only a TMDB sync to compare against.
  if (syncedAt("tmdb")) await triggerMissingRecheck();
  return result;
});

// The posters a scan, TMDB or releases sync may have left unused; in the
// background.
function pruneTmdbPosters() {
  pruneTmdbImages(tmdbPosterPaths()).catch((e) => console.error("[tmdb-images] prune failed:", (e as Error).message));
}

export const triggerTmdbSync = makeTrigger("tmdb-sync", async () => {
  if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is not configured on the backend.");
  const result = await syncTmdb({ tmdbApiKey: TMDB_API_KEY, language: TMDB_LANGUAGE });
  // Keep the missing cache from silently drifting out of date after a fresh TMDB sync.
  await triggerMissingRecheck();
  pruneTmdbPosters();
  return result;
});

// Independent of the others: xREL's releases of the favorite groups, then
// TMDB posters for new titles (skipped without a TMDB key).
export const triggerReleasesSync = makeTrigger("releases-sync", async () => {
  const result = await syncReleases({ tmdbApiKey: TMDB_API_KEY, language: TMDB_LANGUAGE });
  pruneTmdbPosters();
  return result;
});

// The stages by name, for /api/sync/<stage> and /api/status.
export const stageTriggers = {
  library: triggerLibraryScan,
  tmdb: triggerTmdbSync,
  missing: triggerMissingRecheck,
  releases: triggerReleasesSync,
};
export type SyncStage = keyof typeof stageTriggers;

// Installs the interval timers from the env vars, once at boot.
export function applySchedules() {
  setSchedule("library-scan", LIBRARY_SCAN_INTERVAL_HOURS, triggerLibraryScan);
  setSchedule("tmdb-sync", TMDB_SYNC_INTERVAL_HOURS, triggerTmdbSync);
  setSchedule("missing-recheck", MISSING_RECHECK_INTERVAL_HOURS, triggerMissingRecheck);
  setSchedule("releases-sync", XREL_SYNC_INTERVAL_HOURS, triggerReleasesSync);
}

// A stage started by hand (Settings' Sync now, Organize's Rescan): in the
// background, with a note once it's done (a failure has its own,
// makeTrigger's); the scan's says what the library gained or lost.
const DONE_NOTE: Record<SyncStage, string> = {
  library: "Library scanned",
  tmdb: "TMDB synced",
  missing: "Missing rechecked",
  releases: "Releases synced",
};
export function startByHand(stage: SyncStage) {
  const before = libraryCounts();
  stageTriggers[stage]()
    .then(() => {
      const after = libraryCounts();
      const change = (n: number, word: string) => (n ? `${n > 0 ? "+" : "−"}${plural(Math.abs(n), word)}` : null);
      const changes = [change(after.movies - before.movies, "movie"), change(after.shows - before.shows, "show")];
      notify(DONE_NOTE[stage], {
        description: stage === "library" ? changes.filter(Boolean).join(" · ") || "No changes" : undefined,
        tone: "success",
      });
    })
    .catch(() => {});
}
