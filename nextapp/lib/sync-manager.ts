import { syncedAt, tmdbPosterPaths } from "./store";
import { scanLibrary } from "./library-scan";
import { syncNewTmdb, syncTmdb } from "./sync-tmdb";
import { computeMissing } from "./compute-missing";
import { syncReleases } from "./sync-releases";
import { syncWcx } from "./sync-wcx";
import { makeTrigger, nextRunAt, setJitteredSchedule, setSchedule } from "./scheduler";
import { pruneTmdbImages } from "./tmdb-image-cache";
import { pruneLogs } from "./store";
import { log } from "./log";
import {
  TMDB_API_KEY,
  TMDB_LANGUAGE,
  LIBRARY_SCAN_INTERVAL_HOURS,
  TMDB_SYNC_INTERVAL_HOURS,
  XREL_SYNC_INTERVAL_HOURS,
  WCX_API_URL,
  WCX_SYNC_INTERVAL_HOURS,
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
  pruneTmdbImages(tmdbPosterPaths()).catch((e) => log.error("images", "Pruning posters failed", e));
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

// WCX's latest releases, then TMDB for new titles, like xREL's.
export const triggerWcxSync = makeTrigger("wcx-sync", async () => {
  if (!WCX_API_URL) throw new Error("WCX_API_URL is not configured on the backend.");
  const result = await syncWcx({ tmdbApiKey: TMDB_API_KEY, language: TMDB_LANGUAGE });
  pruneTmdbPosters();
  return result;
});

// The stages by name, for /api/sync/<stage> and /api/status.
export const stageTriggers = {
  library: triggerLibraryScan,
  tmdb: triggerTmdbSync,
  releases: triggerReleasesSync,
  wcx: triggerWcxSync,
};
export type SyncStage = keyof typeof stageTriggers;

// Installs the interval timers from the env vars, once at boot.
export function applySchedules() {
  setSchedule("library-scan", LIBRARY_SCAN_INTERVAL_HOURS, triggerLibraryScan);
  setSchedule("tmdb-sync", TMDB_SYNC_INTERVAL_HOURS, triggerTmdbSync);
  setSchedule("releases-sync", XREL_SYNC_INTERVAL_HOURS, triggerReleasesSync);
  setSchedule("log-prune", 24, async () => pruneLogs());
  // Not at boot like the others: when it's due after the last one, or a
  // few minutes from now if that's past (both kept out of the night).
  if (WCX_API_URL) {
    const last = syncedAt("wcx");
    const due = last ? nextRunAt(Date.parse(last), WCX_SYNC_INTERVAL_HOURS) : 0;
    const first = due > Date.now() ? due : nextRunAt(Date.now(), (2 + Math.random() * 13) / 60);
    setJitteredSchedule("wcx-sync", WCX_SYNC_INTERVAL_HOURS, first, triggerWcxSync);
  }
}

// A stage started by hand (Settings' Sync), in the
// background; no note once it's done (you asked for it and see it run), a
// failure has its own (makeTrigger's). fresh: not joining a run that's
// under way (Trigger's fresh).
export function startByHand(stage: SyncStage, fresh = false) {
  log.info(stage === "releases" ? "xrel" : stage, fresh ? "Sync asked for after a move" : "Sync started by hand");
  void (fresh ? stageTriggers[stage].fresh : stageTriggers[stage])().catch(() => {});
}
