import { libraryIds, syncedAt, tmdbPosterPaths } from "./store";
import { fetchMetadataLanguage, resolveAdminUserId } from "./jellyfin";
import { syncJellyfin } from "./sync-jellyfin";
import { syncTmdb } from "./sync-tmdb";
import { computeMissing } from "./compute-missing";
import { syncReleases } from "./sync-releases";
import { makeTrigger, setSchedule } from "./scheduler";
import { pruneImages } from "./image-cache";
import { pruneTmdbImages } from "./tmdb-image-cache";
import {
  JELLYFIN_URL,
  JELLYFIN_API_KEY,
  TMDB_API_KEY,
  JELLYFIN_SYNC_INTERVAL_HOURS,
  TMDB_SYNC_INTERVAL_HOURS,
  MISSING_RECHECK_INTERVAL_HOURS,
  XREL_SYNC_INTERVAL_HOURS,
} from "./env";

type ManagerState = { jellyfinUserId: string | null; metadataLanguage?: string };

// Resolved once per process; on globalThis so `next dev` reloads keep it.
const globalForManager = globalThis as unknown as { __jellylensSyncState?: ManagerState };
const state: ManagerState = (globalForManager.__jellylensSyncState ??= { jellyfinUserId: null });

export async function ensureJellyfinUser(): Promise<string> {
  if (!state.jellyfinUserId) {
    state.jellyfinUserId = await resolveAdminUserId(JELLYFIN_URL, JELLYFIN_API_KEY);
    console.log("[startup] using Jellyfin admin user " + state.jellyfinUserId);
  }
  return state.jellyfinUserId;
}

// Falls back to en-US if Jellyfin can't be reached, without caching that,
// so the next search tries again.
export async function ensureMetadataLanguage(): Promise<string> {
  if (!state.metadataLanguage) {
    try {
      state.metadataLanguage = await fetchMetadataLanguage(JELLYFIN_URL, JELLYFIN_API_KEY);
    } catch {
      return "en-US";
    }
  }
  return state.metadataLanguage;
}

export const triggerMissingRecheck = makeTrigger("missing-recheck", async () => computeMissing());

export const triggerJellyfinSync = makeTrigger("jellyfin-sync", async () => {
  const jellyfinUserId = await ensureJellyfinUser();
  const result = await syncJellyfin({ jellyfinUrl: JELLYFIN_URL, jellyfinApiKey: JELLYFIN_API_KEY, jellyfinUserId });
  pruneImages(libraryIds()).catch((e) => console.error("[images] prune failed:", (e as Error).message));
  // What just arrived is no longer missing; the recheck needs no network,
  // only a TMDB sync to compare against.
  if (syncedAt("tmdb")) await triggerMissingRecheck();
  return result;
});

// The posters a TMDB or releases sync may have left unused; in the
// background, like the Jellyfin image prune.
function pruneTmdbPosters() {
  pruneTmdbImages(tmdbPosterPaths()).catch((e) => console.error("[tmdb-images] prune failed:", (e as Error).message));
}

export const triggerTmdbSync = makeTrigger("tmdb-sync", async () => {
  if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is not configured on the backend.");
  const result = await syncTmdb({ tmdbApiKey: TMDB_API_KEY, language: await ensureMetadataLanguage() });
  // Keep the missing cache from silently drifting out of date after a fresh TMDB sync.
  await triggerMissingRecheck();
  pruneTmdbPosters();
  return result;
});

// Independent of the others: xREL's releases of the favorite groups, then
// TMDB posters for new titles (skipped without a TMDB key).
export const triggerReleasesSync = makeTrigger("releases-sync", async () => {
  const result = await syncReleases({ tmdbApiKey: TMDB_API_KEY, language: await ensureMetadataLanguage() });
  pruneTmdbPosters();
  return result;
});

// The stages by name, for /api/sync/<stage> and /api/status.
export const stageTriggers = {
  jellyfin: triggerJellyfinSync,
  tmdb: triggerTmdbSync,
  missing: triggerMissingRecheck,
  releases: triggerReleasesSync,
};
export type SyncStage = keyof typeof stageTriggers;

// Installs the interval timers from the env vars, once at boot.
export function applySchedules() {
  setSchedule("jellyfin-sync", JELLYFIN_SYNC_INTERVAL_HOURS, triggerJellyfinSync);
  setSchedule("tmdb-sync", TMDB_SYNC_INTERVAL_HOURS, triggerTmdbSync);
  setSchedule("missing-recheck", MISSING_RECHECK_INTERVAL_HOURS, triggerMissingRecheck);
  setSchedule("releases-sync", XREL_SYNC_INTERVAL_HOURS, triggerReleasesSync);
}
