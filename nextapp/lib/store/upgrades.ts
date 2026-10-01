import type { GroupRelease, OwnedFile } from "../upgrades";
import type { Library } from "./files";
import { shownReleases } from "./releases";
import { all, one } from "./sql";

// What the Upgrades page compares (lib/upgrades.ts puts it together): a
// library's files, and the favorite groups' releases of what it has.

const KIND = { movies: "movie", shows: "episode" } as const;
const ITEMS = { movies: "movies", shows: "shows" } as const;

export function ownedFiles(library: Library): OwnedFile[] {
  return all<Omit<OwnedFile, "languages"> & { languages: string }>(
    `SELECT f.parent_id AS parentId, f.title, f.year, f.tmdb_id AS tmdbId,
            json_extract(i.data, '$.ImageTags.Primary') AS imageTag,
            f.season, f.episode, f.episode_end AS episodeEnd, f.file_name AS fileName, f.size, f.grp AS "group", f.resolution, f.codec, f.languages
       FROM media_files f LEFT JOIN ${ITEMS[library]} i ON i.id = f.parent_id
      WHERE f.kind = ? ORDER BY f.parent_id, f.season, f.episode, f.item_id, f.idx`,
    KIND[library]
  ).map((f) => ({ ...f, languages: JSON.parse(f.languages) as string[] }));
}

// Releases of the movies or shows the library has, by their checked TMDB
// match (title_matches); SD only if the page shows those.
export function libraryReleases(library: Library): GroupRelease[] {
  return all<GroupRelease>(
    `SELECT t.tmdb_id AS tmdbId, g.name AS "group", r.name, r.quality, r.size_mb AS sizeMb, r.published_at AS publishedAt
       FROM releases r JOIN release_groups g ON g.id = r.group_id JOIN title_matches t ON t.title_key = r.title_key
      WHERE t.media_type = ? AND ${shownReleases()}
        AND t.tmdb_id IN (SELECT CAST(tmdb_id AS INTEGER) FROM media_files WHERE kind = ? AND tmdb_id IS NOT NULL)`,
    library === "movies" ? "movie" : "tv",
    KIND[library]
  );
}

// The favorite groups, P2P and scene, A→Z; sizesPending: one of them
// hasn't walked its whole list yet, so some of its releases are missing.
export function upgradeGroups(): { favorites: string[]; sizesPending: boolean } {
  const favorites = all<{ name: string }>("SELECT name FROM release_groups ORDER BY lower(name)").map((g) => g.name);
  const pending = one<{ n: number }>("SELECT count(*) AS n FROM release_groups WHERE complete = 0")!.n;
  return { favorites, sizesPending: pending > 0 };
}
