import fs from "fs";
import path from "path";

// Loosely typed: these carry many raw pass-through fields from Jellyfin/TMDB
// that we never touch ourselves, plus the handful we actually read.
export type JellyfinItem = {
  Id: string;
  Name: string;
  ServerId?: string;
  ProductionYear?: number;
  CommunityRating?: number;
  ProviderIds?: { Tmdb?: string; [key: string]: string | undefined };
  MediaStreams?: unknown[];
  Width?: number;
  Height?: number;
  RunTimeTicks?: number;
  Size?: number;
  ReleaseGroup?: string;
  Status?: string;
  ChildCount?: number;
  RecursiveItemCount?: number;
  [key: string]: unknown;
};

export type JellyfinEpisode = {
  Id: string;
  SeriesId: string;
  ParentIndexNumber: number | null;
  IndexNumber: number | null;
  IndexNumberEnd: number | null;
  Size: number;
  // Normalized audio languages ("DE", "EN"; see lib/languages.ts). Missing on
  // caches written before this field existed, until the next Jellyfin sync.
  AudioLanguages?: string[];
};

export type TmdbSeason = { season: number; airedEpisodeNumbers: number[]; episodeNumbers: number[] };
export type TmdbSeriesEntry = { tmdbId: string; seasons: TmdbSeason[] };

// ended: every episode TMDB knows about for this season has already aired —
// as opposed to a season that's still currently airing, where "missing"
// episodes may simply not be out yet.
export type MissingSeason = {
  season: number;
  episodes: string;
  wholeSeason: boolean;
  ended: boolean;
  count: number;
  // Aired episodes TMDB lists for the season (owned = total - count).
  total: number;
  // Every episode TMDB knows for the season, in order, for the per-episode
  // strip on the Missing page. upcoming = not aired yet.
  episodeStates: EpisodeState[];
};
export type EpisodeState = { n: number; state: "owned" | "missing" | "upcoming" };
export type MissingEntry = { count: number; seasons: MissingSeason[] };

// Owned episodes/seasons TMDB doesn't know about for that series — usually
// means the Jellyfin item is matched to the wrong TMDB show, not that
// episodes are actually missing.
export type ExtraSeason = { season: number; episodes: string; count: number };
export type MismatchEntry = { extraSeasons: number[]; extraEpisodes: ExtraSeason[] };

// A row the user dismissed on the Missing page; season null = the whole show.
// Scoped per kind, so ignoring a show's missing episodes doesn't also hide
// its possible mismatches (and vice versa).
export type IgnoreKind = "missing" | "mismatch";
export type IgnoreEntry = { kind: IgnoreKind; seriesId: string; season: number | null };

// Something the user wants added to the library, picked from TMDB search on
// the Requests page. Title/year/poster are copied in so the list renders
// without calling TMDB again. Whether it has arrived isn't stored: it's
// derived on read by matching tmdbId against the Jellyfin cache.
export type RequestEntry = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  year: number | null;
  // First release / air date; absent on requests saved before it existed.
  releaseDate?: string | null;
  posterPath: string | null;
  requestedAt: string;
};

export type Store = {
  jellyfin: {
    movies: JellyfinItem[];
    shows: JellyfinItem[];
    episodes: JellyfinEpisode[];
    syncedAt: string | null;
  };
  tmdb: {
    bySeriesId: Record<string, TmdbSeriesEntry>;
    syncedAt: string | null;
  };
  missing: {
    bySeriesId: Record<string, MissingEntry>;
    syncedAt: string | null;
  };
  mismatches: {
    bySeriesId: Record<string, MismatchEntry>;
    syncedAt: string | null;
  };
  ignored: IgnoreEntry[];
  requests: RequestEntry[];
};

export const DATA_DIR = process.env.DATA_DIR || "/app/data";
const CACHE_FILE = path.join(DATA_DIR, "cache.json");

function emptyState(): Store {
  return {
    jellyfin: { movies: [], shows: [], episodes: [], syncedAt: null },
    tmdb: { bySeriesId: {}, syncedAt: null },
    missing: { bySeriesId: {}, syncedAt: null },
    mismatches: { bySeriesId: {}, syncedAt: null },
    ignored: [],
    requests: [],
  };
}

// Next.js can reload this module in dev; stash the singleton on globalThis so
// a hot reload doesn't wipe the in-memory cache (and re-triggers a full sync).
const globalForStore = globalThis as unknown as { __mediaStore?: Store };
export const store: Store = globalForStore.__mediaStore ?? emptyState();
globalForStore.__mediaStore = store;

export function load() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    // Caches from before the schedule moved to env vars carry a "settings"
    // key; drop it so it isn't written back forever.
    const parsed = JSON.parse(raw);
    delete parsed.settings;
    Object.assign(store, emptyState(), parsed);
    console.log("[store] loaded persisted cache from " + CACHE_FILE);
  } catch {
    console.log("[store] no persisted cache found, starting empty");
  }
}

export function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(store));
  } catch (e) {
    console.error("[store] failed to persist cache:", (e as Error).message);
  }
}
