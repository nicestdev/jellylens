import { db, fromJson, toJson, tx } from "../db";
import { all, one, run, type DataRow } from "./sql";
import { replaceFiles, type StoredFile } from "./files";
import { setSyncedAt } from "./sync-state";

// A movie or show as stored: only the fields Jellylens reads, picked out
// of Jellyfin's items by the sync (lib/sync-jellyfin.ts). ProviderIds.Tmdb:
// the TMDB match; TmdbCollection: the movie's TMDB collection.
type JellyfinBase = {
  Id: string;
  Name: string;
  ServerId?: string;
  ProductionYear?: number;
  ProviderIds: { Tmdb?: string; TmdbCollection?: string };
  ImageTags: { Primary?: string };
  Genres: string[];
};

// FileName: the file's name without its folder, to match the release group
// on the Missing page (every version's file is in media_files, see
// lib/store/files.ts). AudioLanguages: normalized codes (lib/languages.ts).
export type JellyfinMovie = JellyfinBase & {
  Width?: number;
  Height?: number;
  RunTimeTicks?: number;
  FileName?: string;
  AudioLanguages: string[];
};

export type JellyfinShow = JellyfinBase & {
  Status?: string;
  ChildCount?: number;
  RecursiveItemCount?: number;
};

export type JellyfinEpisode = {
  Id: string;
  SeriesId: string;
  ParentIndexNumber: number | null;
  IndexNumber: number | null;
  IndexNumberEnd: number | null;
  Size: number;
  // Normalized audio languages ("DE", "EN"; see lib/languages.ts).
  AudioLanguages: string[];
};

// Movies and shows come back in Jellyfin's sort order.
export const getMovies = () =>
  all<DataRow>("SELECT data FROM movies ORDER BY rowid").map((r) => fromJson<JellyfinMovie>(r.data));
export const getShows = () =>
  all<DataRow>("SELECT data FROM shows ORDER BY rowid").map((r) => fromJson<JellyfinShow>(r.data));

type EpisodeRow = {
  id: string;
  series_id: string;
  season: number | null;
  number: number | null;
  number_end: number | null;
  size: number;
  audio_languages: string;
};

export function getEpisodes(): JellyfinEpisode[] {
  return all<EpisodeRow>("SELECT * FROM episodes").map((r) => ({
    Id: r.id,
    SeriesId: r.series_id,
    ParentIndexNumber: r.season,
    IndexNumber: r.number,
    IndexNumberEnd: r.number_end,
    Size: r.size,
    AudioLanguages: fromJson<string[]>(r.audio_languages),
  }));
}

// Owned movies and shows that TMDB matched, without parsing their JSON.
// imageTag: Jellyfin's poster, for /api/image (see lib/image-cache.ts).
export type LibraryEntry = {
  mediaType: "movie" | "tv";
  id: string;
  tmdbId: string;
  serverId: string;
  imageTag?: string;
  fileName?: string;
};
export function libraryEntries(): LibraryEntry[] {
  const rows = all<Omit<LibraryEntry, "fileName" | "imageTag"> & { fileName: string | null; imageTag: string | null }>(
    `SELECT 'movie' AS mediaType, id, tmdb_id AS tmdbId, ifnull(json_extract(data, '$.ServerId'), '') AS serverId,
            json_extract(data, '$.ImageTags.Primary') AS imageTag, json_extract(data, '$.FileName') AS fileName
       FROM movies WHERE tmdb_id IS NOT NULL
     UNION ALL
     SELECT 'tv', id, tmdb_id, ifnull(json_extract(data, '$.ServerId'), ''), json_extract(data, '$.ImageTags.Primary'), NULL
       FROM shows WHERE tmdb_id IS NOT NULL`,
  );
  return rows.map((r) => ({ ...r, imageTag: r.imageTag ?? undefined, fileName: r.fileName ?? undefined }));
}

// The TMDB collections owned movies belong to, and the shows matched to TMDB.
export const collectionIds = () =>
  all<{ id: string }>("SELECT DISTINCT collection_id AS id FROM movies WHERE collection_id IS NOT NULL").map(
    (r) => r.id,
  );
export const matchedShows = () =>
  all<{ id: string; tmdbId: string }>("SELECT id, tmdb_id AS tmdbId FROM shows WHERE tmdb_id IS NOT NULL");

export function libraryIds(): Set<string> {
  return new Set(all<{ id: string }>("SELECT id FROM movies UNION ALL SELECT id FROM shows").map((r) => r.id));
}

export function libraryCounts() {
  return one<{ movies: number; shows: number; episodes: number }>(
    "SELECT (SELECT count(*) FROM movies) AS movies, (SELECT count(*) FROM shows) AS shows, (SELECT count(*) FROM episodes) AS episodes",
  )!;
}

// files: the movies' and episodes' files, for Analytics.
export function replaceJellyfin(
  {
    movies,
    shows,
    episodes,
    files = [],
  }: { movies: JellyfinMovie[]; shows: JellyfinShow[]; episodes: JellyfinEpisode[]; files?: StoredFile[] },
  at: string | null,
) {
  tx(() => {
    run("DELETE FROM movies");
    run("DELETE FROM shows");
    run("DELETE FROM episodes");
    const movie = db().prepare("INSERT INTO movies (id, tmdb_id, collection_id, data) VALUES (?, ?, ?, ?)");
    for (const m of movies) {
      movie.run(m.Id, m.ProviderIds?.Tmdb ?? null, m.ProviderIds?.TmdbCollection ?? null, toJson(m));
    }
    const show = db().prepare("INSERT INTO shows (id, tmdb_id, data) VALUES (?, ?, ?)");
    for (const s of shows) show.run(s.Id, s.ProviderIds?.Tmdb ?? null, toJson(s));
    const episode = db().prepare(
      "INSERT INTO episodes (id, series_id, season, number, number_end, size, audio_languages) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const e of episodes) {
      episode.run(
        e.Id,
        e.SeriesId,
        e.ParentIndexNumber,
        e.IndexNumber,
        e.IndexNumberEnd,
        e.Size,
        toJson(e.AudioLanguages),
      );
    }
    replaceFiles(files);
    setSyncedAt("jellyfin", at);
  });
}

// "movie:603" / "tv:1396" → the owned item. Movie and TV ids are separate
// TMDB namespaces, so the type has to be part of the key.
export function libraryIndex(): Map<string, LibraryEntry> {
  return new Map(libraryEntries().map((e) => [e.mediaType + ":" + e.tmdbId, e]));
}

// Where an owned item lives in Jellyfin, for linking to it.
export function libraryRef(item: LibraryEntry | undefined): { id: string; serverId: string } | null {
  return item ? { id: item.id, serverId: item.serverId } : null;
}
