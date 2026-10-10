import { db, fromJson, toJson, tx } from "../db";
import { all, one, run, type DataRow } from "./sql";
import { replaceFiles, type StoredFile } from "./files";
import { setSyncedAt } from "./sync-state";

// A movie or show as stored, put together by the library scan
// (lib/library-scan.ts) from its folders, its files' probes and TMDB's
// details. Id: its TMDB id (ProviderIds.Tmdb), from the folder's
// "[tmdbid-N]"; TmdbCollection: the movie's TMDB collection. Name, Genres,
// PosterPath (TMDB's): from TMDB in the metadata language, the folder's
// name and year until TMDB has been asked. Disks: the disks it's on.
type LibraryBase = {
  Id: string;
  Name: string;
  ProductionYear?: number;
  ProviderIds: { Tmdb?: string; TmdbCollection?: string };
  PosterPath: string | null;
  Genres: string[];
  Disks: string[];
};

// FileName: the file's name without its folder, to match the release group
// on the Missing page (every version's file is in media_files, see
// lib/store/files.ts). AudioLanguages: normalized codes (lib/languages.ts).
export type LibraryMovie = LibraryBase & {
  Width?: number;
  Height?: number;
  RunTimeTicks?: number;
  FileName?: string;
  AudioLanguages: string[];
};

export type LibraryShow = LibraryBase & {
  Status?: string;
  ChildCount?: number;
  RecursiveItemCount?: number;
};

export type LibraryEpisode = {
  Id: string;
  SeriesId: string;
  ParentIndexNumber: number | null;
  IndexNumber: number | null;
  IndexNumberEnd: number | null;
  Size: number;
  // Normalized audio languages ("DE", "EN"; see lib/languages.ts).
  AudioLanguages: string[];
};

// Movies and shows come back by name.
export const getMovies = () =>
  all<DataRow>("SELECT data FROM movies ORDER BY rowid").map((r) => fromJson<LibraryMovie>(r.data));
export const getShows = () =>
  all<DataRow>("SELECT data FROM shows ORDER BY rowid").map((r) => fromJson<LibraryShow>(r.data));

type EpisodeRow = {
  id: string;
  series_id: string;
  season: number | null;
  number: number | null;
  number_end: number | null;
  size: number;
  audio_languages: string;
};

export function getEpisodes(): LibraryEpisode[] {
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

// Owned movies and shows, without parsing their JSON. posterPath: TMDB's.
export type LibraryEntry = {
  mediaType: "movie" | "tv";
  id: string;
  tmdbId: string;
  posterPath: string | null;
  fileName?: string;
};
export function libraryEntries(): LibraryEntry[] {
  const rows = all<Omit<LibraryEntry, "fileName"> & { fileName: string | null }>(
    `SELECT 'movie' AS mediaType, id, tmdb_id AS tmdbId, json_extract(data, '$.PosterPath') AS posterPath,
            json_extract(data, '$.FileName') AS fileName
       FROM movies WHERE tmdb_id IS NOT NULL
     UNION ALL
     SELECT 'tv', id, tmdb_id, json_extract(data, '$.PosterPath'), NULL
       FROM shows WHERE tmdb_id IS NOT NULL`,
  );
  return rows.map((r) => ({ ...r, fileName: r.fileName ?? undefined }));
}

// The TMDB collections owned movies belong to, and the shows matched to TMDB.
export const collectionIds = () =>
  all<{ id: string }>("SELECT DISTINCT collection_id AS id FROM movies WHERE collection_id IS NOT NULL").map(
    (r) => r.id,
  );
export const matchedShows = () =>
  all<{ id: string; tmdbId: string }>("SELECT id, tmdb_id AS tmdbId FROM shows WHERE tmdb_id IS NOT NULL");

export function libraryCounts() {
  return one<{ movies: number; shows: number; episodes: number }>(
    "SELECT (SELECT count(*) FROM movies) AS movies, (SELECT count(*) FROM shows) AS shows, (SELECT count(*) FROM episodes) AS episodes",
  )!;
}

// files: the movies' and episodes' files, for Analytics.
export function replaceLibrary(
  {
    movies,
    shows,
    episodes,
    files = [],
  }: { movies: LibraryMovie[]; shows: LibraryShow[]; episodes: LibraryEpisode[]; files?: StoredFile[] },
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
    setSyncedAt("library", at);
  });
}

// "movie:603" / "tv:1396" → the owned item. Movie and TV ids are separate
// TMDB namespaces, so the type has to be part of the key.
export function libraryIndex(): Map<string, LibraryEntry> {
  return new Map(libraryEntries().map((e) => [e.mediaType + ":" + e.tmdbId, e]));
}

// An owned item, for marking it as in the library.
export function libraryRef(item: LibraryEntry | undefined): { id: string } | null {
  return item ? { id: item.id } : null;
}

// Writes movies and shows back with new details (after a TMDB sync), their
// episodes and files as they are.
export function updateTitles(movies: LibraryMovie[], shows: LibraryShow[]) {
  tx(() => {
    const movie = db().prepare("UPDATE movies SET collection_id = ?, data = ? WHERE id = ?");
    for (const m of movies) movie.run(m.ProviderIds?.TmdbCollection ?? null, toJson(m), m.Id);
    const show = db().prepare("UPDATE shows SET data = ? WHERE id = ?");
    for (const s of shows) show.run(toJson(s), s.Id);
  });
}
