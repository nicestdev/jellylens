import { db, fromJson, toJson, tx } from "../db";
import { all, one, run, type DataRow } from "./sql";
import { replaceFiles, type StoredFile } from "./files";
import { setSyncedAt } from "./sync-state";

// A movie or show as stored, put together by the library scan
// (lib/library-scan.ts) from its folders, its files' probes and TMDB's
// details. id: its TMDB id (as is tmdbId), from the folder's
// "[tmdbid-N]". name, genres, posterPath (TMDB's): from TMDB in the
// metadata language, the folder's name and year until TMDB has been asked. disks: the disks it's on.
type LibraryBase = {
  id: string;
  name: string;
  year?: number;
  tmdbId?: string;
  posterPath: string | null;
  genres: string[];
  disks: string[];
};

// fileName: the file's name without its folder, to match the release group
// (every version's file is in media_files, see
// lib/store/files.ts). runtime: seconds. audioLanguages: normalized codes (lib/languages.ts).
export type LibraryMovie = LibraryBase & {
  width?: number;
  height?: number;
  runtime?: number;
  fileName?: string;
  audioLanguages: string[];
};

// seasonCount, episodeCount: the seasons and episodes it has on disk.
export type LibraryShow = LibraryBase & {
  status?: string;
  seasonCount?: number;
  episodeCount?: number;
};

export type LibraryEpisode = {
  id: string;
  showId: string;
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  size: number;
  // Normalized audio languages ("DE", "EN"; see lib/languages.ts).
  audioLanguages: string[];
};

// Movies and shows come back by name.
export const getMovies = () =>
  all<DataRow>("SELECT data FROM movies ORDER BY rowid").map((r) => fromJson<LibraryMovie>(r.data));
export const getShows = () =>
  all<DataRow>("SELECT data FROM shows ORDER BY rowid").map((r) => fromJson<LibraryShow>(r.data));

type EpisodeRow = {
  id: string;
  show_id: string;
  season: number | null;
  number: number | null;
  number_end: number | null;
  size: number;
  audio_languages: string;
};

export function getEpisodes(): LibraryEpisode[] {
  return all<EpisodeRow>("SELECT * FROM episodes").map((r) => ({
    id: r.id,
    showId: r.show_id,
    season: r.season,
    episode: r.number,
    episodeEnd: r.number_end,
    size: r.size,
    audioLanguages: fromJson<string[]>(r.audio_languages),
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
    `SELECT 'movie' AS mediaType, id, tmdb_id AS tmdbId, json_extract(data, '$.posterPath') AS posterPath,
            json_extract(data, '$.fileName') AS fileName
       FROM movies WHERE tmdb_id IS NOT NULL
     UNION ALL
     SELECT 'tv', id, tmdb_id, json_extract(data, '$.posterPath'), NULL
       FROM shows WHERE tmdb_id IS NOT NULL`,
  );
  return rows.map((r) => ({ ...r, fileName: r.fileName ?? undefined }));
}

// The shows matched to TMDB.
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
    const movie = db().prepare("INSERT INTO movies (id, tmdb_id, data) VALUES (?, ?, ?)");
    for (const m of movies) movie.run(m.id, m.tmdbId ?? null, toJson(m));
    const show = db().prepare("INSERT INTO shows (id, tmdb_id, data) VALUES (?, ?, ?)");
    for (const s of shows) show.run(s.id, s.tmdbId ?? null, toJson(s));
    const episode = db().prepare(
      "INSERT INTO episodes (id, show_id, season, number, number_end, size, audio_languages) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const e of episodes) {
      episode.run(e.id, e.showId, e.season, e.episode, e.episodeEnd, e.size, toJson(e.audioLanguages));
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
    const movie = db().prepare("UPDATE movies SET data = ? WHERE id = ?");
    for (const m of movies) movie.run(toJson(m), m.id);
    const show = db().prepare("UPDATE shows SET data = ? WHERE id = ?");
    for (const s of shows) show.run(toJson(s), s.id);
  });
}
