import { syncedAt, tmdbPosterPaths } from "./store";
import { scanLibrary } from "./library-scan";
import { syncNewTmdb, syncTmdb } from "./sync-tmdb";
import { computeMissing } from "./compute-missing";
import { syncReleases } from "./sync-releases";
import { makeTrigger, setSchedule } from "./scheduler";
import { pruneTmdbImages } from "./tmdb-image-cache";
import {
  TMDB_API_KEY,
  TMDB_LANGUAGE,
  LIBRARY_SCAN_INTERVAL_HOURS,
  TMDB_SYNC_INTERVAL_HOURS,
  XREL_SYNC_INTERVAL_HOURS,
} from "./env";

export const triggerLibraryScan = makeTrigger("library-scan", async () => {
  const tmdb = TMDB_API_KEY ? { apiKey: TMDB_API_KEY, language: TMDB_LANGUAGE } : null;
  const result = await scanLibrary(tmdb);
  pruneTmdbPosters();
  // Then which shows are incomplete (computeMissing: no network, only a
  // TMDB sync to compare against): what just arrived no longer counts. A
  // show new since that sync gets its seasons first, or it's skipped.
  if (syncedAt("tmdb")) {
    if (tmdb) await syncNewTmdb(tmdb.apiKey);
    computeMissing();
  }
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
  // Then which shows are incomplete, against the fresh seasons (and what
  // aired since the last run: this daily sync is what catches that).
  computeMissing();
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
  releases: triggerReleasesSync,
};
export type SyncStage = keyof typeof stageTriggers;

// Installs the interval timers from the env vars, once at boot.
export function applySchedules() {
  setSchedule("library-scan", LIBRARY_SCAN_INTERVAL_HOURS, triggerLibraryScan);
  setSchedule("tmdb-sync", TMDB_SYNC_INTERVAL_HOURS, triggerTmdbSync);
  setSchedule("releases-sync", XREL_SYNC_INTERVAL_HOURS, triggerReleasesSync);
}

// A stage started by hand (Settings' Sync, the Queue's Rescan), in the
// background; no note once it's done (you asked for it and see it run), a
// failure has its own (makeTrigger's). fresh: not joining a run that's
// under way (Trigger's fresh).
export function startByHand(stage: SyncStage, fresh = false) {
  void (fresh ? stageTriggers[stage].fresh : stageTriggers[stage])().catch(() => {});
}
