import { db, fromJson, toJson, tx } from "../db";
import { all, one, run } from "./sql";
import { setSyncedAt } from "./sync-state";

export type TmdbSeason = { season: number; airedEpisodeNumbers: number[]; episodeNumbers: number[] };
export type TmdbShowEntry = { tmdbId: string; seasons: TmdbSeason[] };

export function getTmdbShows(): Record<string, TmdbShowEntry> {
  const rows = all<{ show_id: string; tmdb_id: string; seasons: string }>("SELECT * FROM tmdb_shows");
  return Object.fromEntries(
    rows.map((r) => [r.show_id, { tmdbId: r.tmdb_id, seasons: fromJson<TmdbSeason[]>(r.seasons) }]),
  );
}

// Every TMDB entry loaded, each once: the library's titles (their details,
// a show's episode lists) and the titles xREL's releases matched.
export function tmdbCounts() {
  const entries = (type: "movie" | "tv", more = "") =>
    `SELECT count(*) FROM (
       SELECT tmdb_id FROM tmdb_details WHERE media_type = '${type}'
       UNION SELECT CAST(tmdb_id AS TEXT) FROM title_matches WHERE media_type = '${type}' AND tmdb_id IS NOT NULL
       ${more})`;
  return one<{ movies: number; shows: number }>(
    `SELECT (${entries("movie")}) AS movies,
       (${entries("tv", "UNION SELECT tmdb_id FROM tmdb_shows")}) AS shows`,
  )!;
}

export function replaceTmdb(byShowId: Record<string, TmdbShowEntry>, at: string | null) {
  tx(() => {
    run("DELETE FROM tmdb_shows");
    const series = db().prepare("INSERT INTO tmdb_shows (show_id, tmdb_id, seasons) VALUES (?, ?, ?)");
    for (const [id, s] of Object.entries(byShowId)) series.run(id, s.tmdbId, toJson(s.seasons));
    setSyncedAt("tmdb", at);
  });
}

// Adds (or overwrites) single shows, leaving the rest and the sync time
// alone: what a library scan found that no TMDB sync has seen.
export function addTmdb(byShowId: Record<string, TmdbShowEntry>) {
  tx(() => {
    const series = db().prepare("INSERT OR REPLACE INTO tmdb_shows (show_id, tmdb_id, seasons) VALUES (?, ?, ?)");
    for (const [id, s] of Object.entries(byShowId)) series.run(id, s.tmdbId, toJson(s.seasons));
  });
}
