import { store } from "./store";
import { fetchMetadataLanguage, resolveAdminUserId } from "./jellyfin";
import { syncJellyfin } from "./sync-jellyfin";
import { syncTmdb } from "./sync-tmdb";
import { computeMissing } from "./compute-missing";
import { makeTrigger, setSchedule } from "./scheduler";
import { pruneImages } from "./image-cache";
import {
  JELLYFIN_URL,
  JELLYFIN_API_KEY,
  TMDB_API_KEY,
  JELLYFIN_SYNC_INTERVAL_HOURS,
  TMDB_SYNC_INTERVAL_HOURS,
  MISSING_RECHECK_INTERVAL_HOURS,
} from "./env";

type ManagerState = { jellyfinUserId: string | null; metadataLanguage?: string };

// Stashed on globalThis so `next dev` hot reloads don't lose the resolved
// user id or create duplicate in-flight trackers (see lib/store.ts for why).
const globalForManager = globalThis as unknown as { __mediaSyncState?: ManagerState };
const state: ManagerState = globalForManager.__mediaSyncState ?? { jellyfinUserId: null };
globalForManager.__mediaSyncState = state;

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

export const triggerMissingRecheck = makeTrigger("missing-recheck", () =>
  Promise.resolve().then(() => computeMissing(store))
);

export const triggerJellyfinSync = makeTrigger("jellyfin-sync", async () => {
  const jellyfinUserId = await ensureJellyfinUser();
  const result = await syncJellyfin(store, { jellyfinUrl: JELLYFIN_URL, jellyfinApiKey: JELLYFIN_API_KEY, jellyfinUserId });
  const ids = new Set([...store.jellyfin.movies, ...store.jellyfin.shows].map((item) => item.Id));
  pruneImages(ids).catch((e) => console.error("[images] prune failed:", (e as Error).message));
  return result;
});

export const triggerTmdbSync = makeTrigger("tmdb-sync", () => {
  if (!TMDB_API_KEY) return Promise.reject(new Error("TMDB_API_KEY is not configured on the backend."));
  return syncTmdb(store, { tmdbApiKey: TMDB_API_KEY }).then((result) =>
    // Keep the missing cache from silently drifting out of date after a fresh TMDB sync.
    triggerMissingRecheck().then(() => result)
  );
});

// Installs the three interval timers from the env vars, once at boot.
export function applySchedules() {
  setSchedule("jellyfin-sync", JELLYFIN_SYNC_INTERVAL_HOURS, () => void triggerJellyfinSync());
  setSchedule("tmdb-sync", TMDB_SYNC_INTERVAL_HOURS, () => void triggerTmdbSync());
  setSchedule("missing-recheck", MISSING_RECHECK_INTERVAL_HOURS, () => void triggerMissingRecheck());
}
