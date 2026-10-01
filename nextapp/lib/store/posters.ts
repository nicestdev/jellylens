import { all } from "./sql";

// Every TMDB poster path something stored still shows: requests, movie
// collections and their parts, and titles on the Releases page. The TMDB
// image cache keeps these (see pruneTmdbImages).
export function tmdbPosterPaths(): Set<string> {
  const rows = all<{ path: string | null }>(
    `SELECT poster_path AS path FROM requests
     UNION SELECT poster_path FROM tmdb_collections
     UNION SELECT json_extract(p.value, '$.posterPath') FROM tmdb_collections c, json_each(c.parts) p
     UNION SELECT poster_path FROM title_matches`
  );
  return new Set(rows.map((r) => r.path).filter((p): p is string => Boolean(p)));
}
