import { db, toJson, tx } from "../db";
import { all, byKey, one, run } from "./sql";
import { setSyncedAt } from "./sync-state";
import type { CollectionPart } from "./tmdb";

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

// A collection with at least one part not owned that's out on disc or
// digital. Parts not out that way yet are left out until they are.
// fileName: the owned movie's file (see JellyfinMovie.FileName), so you can
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

export const getMissingSeries = () => byKey<MissingEntry>(all("SELECT series_id AS key, data FROM missing_series"));
export const getMissingCollections = () =>
  byKey<MissingCollection>(all("SELECT collection_id AS key, data FROM missing_collections"));
export const getMismatches = () => byKey<MismatchEntry>(all("SELECT series_id AS key, data FROM mismatches"));

export function missingCounts() {
  return one<{ series: number; collections: number; mismatches: number }>(
    "SELECT (SELECT count(*) FROM missing_series) AS series, (SELECT count(*) FROM missing_collections) AS collections, (SELECT count(*) FROM mismatches) AS mismatches"
  )!;
}

export function replaceMissing(
  bySeriesId: Record<string, MissingEntry>,
  byCollectionId: Record<string, MissingCollection>,
  mismatches: Record<string, MismatchEntry>,
  at: string | null
) {
  tx(() => {
    const tables = [
      ["missing_series", "series_id", bySeriesId],
      ["missing_collections", "collection_id", byCollectionId],
      ["mismatches", "series_id", mismatches],
    ] as const;
    for (const [table, key, rows] of tables) {
      run(`DELETE FROM ${table}`);
      const insert = db().prepare(`INSERT INTO ${table} (${key}, data) VALUES (?, ?)`);
      for (const [id, value] of Object.entries(rows)) insert.run(id, toJson(value));
    }
    setSyncedAt("missing", at);
  });
}
