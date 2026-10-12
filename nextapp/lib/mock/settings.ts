// Made-up Settings data for `next dev` (Mock data,
// lib/mock/fetch.ts), like lib/mock/data.ts for the Queue:
// a stage synced, one running, one never synced (and off); keys set,
// masked and missing; release groups synced, syncing, still loading and
// waiting for their first sync. Typed by the routes' responses.
import type { ConfigResponse, ReleaseGroupsResponse, StatusResponse } from "@/lib/api-types";
import type { Preferences } from "@/lib/store/preferences";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export function mockStatus(): StatusResponse {
  return {
    library: { syncedAt: ago(95), running: false, error: null, movies: 1824, shows: 312 },
    tmdb: { syncedAt: ago(60 * 20), running: true, error: null, movies: 1824, shows: 312 },
    releases: { syncedAt: null, running: false, error: null, groups: 7, releases: 4618 },
  };
}

export function mockConfig(): ConfigResponse {
  return {
    jellyfinUrl: "http://jellyfin:8096",
    jellyfinApiKey: "3f9a********c21e",
    tmdbApiKey: "8b2d********90af",
    tmdbLanguage: "de-DE",
    authEnabled: true,
    ddownloadLogin: "jellylens",
    ddownloadPassword: "********",
    realDebridToken: "",
    archivePasswords: 2,
    p2pGroups: 3,
    sceneGroups: 0,
    downloadDir: "/downloads",
    intervals: { library: 6, tmdb: 24, releases: 0 },
    downloadSlots: 3,
    maxDownloadSlots: 10,
    passwords: ["serienjunkies.org", "hd-area.org"],
  };
}

export function mockPreferences(): Preferences {
  return { showSdReleases: false };
}

const group = (id: string, kind: "p2p" | "scene", name: string, count: number, synced: number | null, more = {}) => ({
  id,
  kind,
  name,
  count,
  syncedAt: synced === null ? null : ago(synced),
  complete: synced !== null,
  syncing: false,
  ...more,
});

export function mockReleaseGroups(): ReleaseGroupsResponse {
  return {
    matching: false,
    items: [
      group("1021", "p2p", "WAYNE", 1408, 12),
      group("1187", "p2p", "SPiCY", 892, 12),
      group("1310", "p2p", "ZeroTwo", 655, 12, { syncing: true }),
      group("1452", "p2p", "TVARCHiV", 214, null, { syncing: true }),
      group("1533", "p2p", "SAUERKRAUT", 0, null),
      group("scene:DETAiLS", "scene", "DETAiLS", 51, 12),
      group("scene:ZQ", "scene", "ZQ", 48, 60 * 26),
    ],
  };
}
