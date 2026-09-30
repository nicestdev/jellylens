import fs from "fs";
import path from "path";
import { DATA_DIR } from "./env";
import { LOCAL_USER } from "./session";
import type { MovieReleases } from "./tmdb";

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
  // Movies only: the file's name, without its folder.
  FileName?: string;
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

// A TMDB movie collection ("The Lord of the Rings Collection") that at least
// one owned movie belongs to, via Jellyfin's TmdbCollection provider id.
// Parts are sorted by release date; releaseDate null = not dated yet.
// releases: cinema/digital/disc dates, fetched only for parts that came out
// within the last year — older ones are taken as out on disc or digital.
export type CollectionPart = {
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
  releases?: MovieReleases;
};
export type TmdbCollection = { name: string; posterPath: string | null; parts: CollectionPart[] };

// A collection with at least one part not owned that's out on disc or
// digital. Parts not out that way yet are left out until they are.
// fileName: the owned movie's file (see JellyfinItem.FileName), so you can
// get the missing parts from the same release group.
export type MissingCollection = {
  count: number; // home-released parts not owned
  parts: (Omit<CollectionPart, "releases"> & { owned: boolean; fileName?: string })[];
};

// Owned episodes/seasons TMDB doesn't know about for that series — usually
// means the Jellyfin item is matched to the wrong TMDB show, not that
// episodes are actually missing.
export type ExtraSeason = { season: number; episodes: string; count: number };
export type MismatchEntry = { extraSeasons: number[]; extraEpisodes: ExtraSeason[] };

// A row the user dismissed on the Missing page; season null = the whole show.
// Scoped per kind, so ignoring a show's missing episodes doesn't also hide
// its possible mismatches (and vice versa). For kind "collection", seriesId
// is the TMDB collection id and movieId one of its parts (null = all of it).
export type IgnoreKind = "missing" | "mismatch";
export type IgnoreEntry =
  | { kind: IgnoreKind; seriesId: string; season: number | null }
  | { kind: "collection"; collectionId: string; movieId: number | null };

// Something the user wants added to the library, picked from TMDB search on
// the Requests page. Title/year/poster are copied in so the list renders
// without calling TMDB again. Whether it has arrived isn't stored: it's
// derived on read by matching tmdbId against the Jellyfin cache.
// One entry per title, however many people asked for it: requesters lists
// them, and the entry goes once the last one takes their request back.
export type RequestEntry = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  year: number | null;
  // First release / air date; absent on requests saved before it existed.
  releaseDate?: string | null;
  posterPath: string | null;
  // When anyone first asked for it.
  requestedAt: string;
  requesters: Requester[];
};

// A Jellyfin user, by id; the name is kept for the admin's overview.
export type Requester = { id: string; name: string; requestedAt: string };

// Display options an admin sets on the Settings page. Unlike the env-var
// config, these are changed at runtime, so they live in the cache.
// showFileNames: owned movies' file names on the Missing page's collection
// cards (to match the release group); off, they aren't sent at all.
export type Preferences = { showFileNames: boolean };

export type Store = {
  jellyfin: {
    movies: JellyfinItem[];
    shows: JellyfinItem[];
    episodes: JellyfinEpisode[];
    syncedAt: string | null;
  };
  tmdb: {
    bySeriesId: Record<string, TmdbSeriesEntry>;
    byCollectionId: Record<string, TmdbCollection>;
    syncedAt: string | null;
  };
  missing: {
    bySeriesId: Record<string, MissingEntry>;
    byCollectionId: Record<string, MissingCollection>;
    syncedAt: string | null;
  };
  mismatches: {
    bySeriesId: Record<string, MismatchEntry>;
    syncedAt: string | null;
  };
  ignored: IgnoreEntry[];
  requests: RequestEntry[];
  preferences: Preferences;
};

const CACHE_FILE = path.join(DATA_DIR, "cache.json");

function emptyState(): Store {
  return {
    jellyfin: { movies: [], shows: [], episodes: [], syncedAt: null },
    tmdb: { bySeriesId: {}, byCollectionId: {}, syncedAt: null },
    missing: { bySeriesId: {}, byCollectionId: {}, syncedAt: null },
    mismatches: { bySeriesId: {}, syncedAt: null },
    ignored: [],
    requests: [],
    preferences: { showFileNames: false },
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
    // Only a shallow merge: caches from before movie collections existed
    // lack these until the next TMDB sync / missing recheck.
    store.tmdb.byCollectionId ??= {};
    store.missing.byCollectionId ??= {};
    // Requests from before sign-in existed have no requesters; they go to
    // the local user, whom the first admin to sign in takes over from.
    for (const r of store.requests) {
      r.requesters ??= [{ id: LOCAL_USER.id, name: LOCAL_USER.name, requestedAt: r.requestedAt }];
    }
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
