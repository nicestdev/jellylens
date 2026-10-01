import { db, fromJson, toJson, tx } from "../db";
import type { MovieReleases } from "../tmdb";
import { all, one, run } from "./sql";
import { setSyncedAt } from "./sync-state";

export type TmdbSeason = { season: number; airedEpisodeNumbers: number[]; episodeNumbers: number[] };
export type TmdbSeriesEntry = { tmdbId: string; seasons: TmdbSeason[] };

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

export function getTmdbSeries(): Record<string, TmdbSeriesEntry> {
  const rows = all<{ series_id: string; tmdb_id: string; seasons: string }>("SELECT * FROM tmdb_series");
  return Object.fromEntries(
    rows.map((r) => [r.series_id, { tmdbId: r.tmdb_id, seasons: fromJson<TmdbSeason[]>(r.seasons) }])
  );
}

export function getTmdbCollections(): Record<string, TmdbCollection> {
  const rows = all<{ id: string; name: string; poster_path: string | null; parts: string }>(
    "SELECT * FROM tmdb_collections"
  );
  return Object.fromEntries(
    rows.map((r) => [r.id, { name: r.name, posterPath: r.poster_path, parts: fromJson<CollectionPart[]>(r.parts) }])
  );
}

export function tmdbCounts() {
  return one<{ shows: number; collections: number }>(
    "SELECT (SELECT count(*) FROM tmdb_series) AS shows, (SELECT count(*) FROM tmdb_collections) AS collections"
  )!;
}

export function replaceTmdb(
  bySeriesId: Record<string, TmdbSeriesEntry>,
  byCollectionId: Record<string, TmdbCollection>,
  at: string | null
) {
  tx(() => {
    run("DELETE FROM tmdb_series");
    run("DELETE FROM tmdb_collections");
    const series = db().prepare("INSERT INTO tmdb_series (series_id, tmdb_id, seasons) VALUES (?, ?, ?)");
    for (const [id, s] of Object.entries(bySeriesId)) series.run(id, s.tmdbId, toJson(s.seasons));
    const collection = db().prepare("INSERT INTO tmdb_collections (id, name, poster_path, parts) VALUES (?, ?, ?, ?)");
    for (const [id, c] of Object.entries(byCollectionId)) collection.run(id, c.name, c.posterPath, toJson(c.parts));
    setSyncedAt("tmdb", at);
  });
}
