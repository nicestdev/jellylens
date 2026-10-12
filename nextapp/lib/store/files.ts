import { db } from "../db";
import { all, one, run } from "./sql";

// The library's files for Analytics (media_files in lib/db.ts), written
// with the library by replaceLibrary: the movies' and the episodes'.
// Everything the page shows is counted here in SQL, never in the browser
// (a show library has tens of thousands).

// The two libraries: the movies and the shows (their episodes).
export type Library = "movies" | "shows";
const KIND: Record<Library, "movie" | "episode"> = { movies: "movie", shows: "episode" };

// A file as stored. parentId: the movie, or the episode's show; title,
// year, tmdbId: the movie's or the show's; the episode fields are null for
// movies. group: as first spelled in the library, null if none; groupKey:
// lowercased. resolution, codec: labels, "" if unknown. languages: the
// audio's codes, none if untagged. search: titles and file name, folded
// (lib/text.ts).
export type StoredFile = {
  kind: "movie" | "episode";
  itemId: string;
  idx: number;
  parentId: string;
  title: string;
  year: number | null;
  tmdbId: string | null;
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  episodeTitle: string | null;
  fileName: string;
  // Under LIBRARY_DIR ("nvme01/movies/…/Heat….mkv").
  path: string;
  size: number;
  group: string | null;
  groupKey: string | null;
  resolution: string;
  codec: string;
  languages: string[];
  search: string;
};

// Called inside replaceLibrary's transaction.
export function replaceFiles(files: StoredFile[]) {
  run("DELETE FROM media_files");
  const insert = db().prepare(
    `INSERT INTO media_files (kind, item_id, idx, parent_id, title, year, tmdb_id, season, episode, episode_end, episode_title,
                              file_name, path, size, grp, grp_key, resolution, codec, languages, search)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const f of files) {
    insert.run(
      f.kind,
      f.itemId,
      f.idx,
      f.parentId,
      f.title,
      f.year,
      f.tmdbId,
      f.season,
      f.episode,
      f.episodeEnd,
      f.episodeTitle,
      f.fileName,
      f.path,
      f.size,
      f.group,
      f.groupKey,
      f.resolution,
      f.codec,
      JSON.stringify(f.languages),
      f.search,
    );
  }
}

// Each movie's video codec label (its first version's file), by item id,
// for the Movies list; "" when the probe found none.
export function movieCodecs(): Map<string, string> {
  const rows = all<{ itemId: string; codec: string }>(
    "SELECT item_id AS itemId, codec FROM media_files WHERE kind = 'movie' AND idx = 0",
  );
  return new Map(rows.map((r) => [r.itemId, r.codec]));
}

// ---- Totals, for Analytics

// titles: every movie or show; files: the movies' or the episodes';
// seconds: their runtime (ffprobe's, from
// probes). pending: titles but no files yet (stored before the files
// were, until the next sync).
export type LibraryTotals = {
  titles: number;
  files: number;
  size: number;
  seconds: number;
  pending: boolean;
};

export function libraryTotals(library: Library): LibraryTotals {
  const r = one<Omit<LibraryTotals, "pending">>(
    `SELECT (SELECT count(*) FROM ${library}) AS titles, count(*) AS files, ifnull(sum(f.size), 0) AS size,
            ifnull(sum(json_extract(p.data, '$.seconds')), 0) AS seconds
       FROM media_files f LEFT JOIN probes p ON p.path = f.path WHERE kind = ?`,
    KIND[library],
  )!;
  return { ...r, pending: r.titles > 0 && r.files === 0 };
}

// A value's files, the movies' and the episodes' apart, and their bytes.
// value: a group's name (null: none), a resolution or a codec ("" unknown),
// or an audio mix (AUDIO).
export type FilePart<V = string> = { value: V; movies: number; episodes: number; size: number };

const PART = "sum(kind = 'movie') AS movies, sum(kind = 'episode') AS episodes, sum(size) AS size";

// Per value of a column, the largest first.
function partsBy<V>(column: "grp" | "resolution" | "codec"): FilePart<V>[] {
  return all<FilePart<V>>(
    `SELECT ${column} AS value, ${PART}
       FROM media_files GROUP BY ${column === "grp" ? "grp_key" : column}
      ORDER BY size DESC, value`,
  );
}

export const filesByGroup = () => partsBy<string | null>("grp");
export const filesByResolution = () => partsBy<string>("resolution");
export const filesByCodec = () => partsBy<string>("codec");

// Files and bytes per resolution and codec together, for the heatmap.
export type QualityCell = { resolution: string; codec: string; files: number; size: number };

export const filesByQuality = () =>
  all<QualityCell>(
    "SELECT resolution, codec, count(*) AS files, sum(size) AS size FROM media_files GROUP BY resolution, codec",
  );

// Which of German and English a file's audio has: both, one, neither
// ("other": only other languages), or none tagged ("").
export const AUDIO = ["DE+EN", "DE", "EN", "other", ""] as const;
export type AudioMix = (typeof AUDIO)[number];

export function filesByAudio(): FilePart<AudioMix>[] {
  const has = (code: string) => `instr(languages, '"${code}"') > 0`;
  return all<FilePart<AudioMix>>(
    `SELECT CASE WHEN ${has("DE")} AND ${has("EN")} THEN 'DE+EN' WHEN ${has("DE")} THEN 'DE'
                 WHEN ${has("EN")} THEN 'EN' WHEN languages = '[]' THEN '' ELSE 'other' END AS value, ${PART}
       FROM media_files GROUP BY value`,
  );
}

// What the library has of a TMDB movie or show, for the Queue:
// each file's name, quality, codec and group, and an episode's season and
// numbers.
export type LibraryCopy = {
  fileName: string;
  path: string; // under LIBRARY_DIR, its disk first ("nvme02/shows/…")
  size: number; // bytes
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  resolution: string;
  codec: string;
  group: string | null;
};

export function libraryCopies(kind: "movie" | "episode", tmdbId: number): LibraryCopy[] {
  return all<LibraryCopy>(
    `SELECT file_name AS fileName, path, size, season, episode, episode_end AS episodeEnd, resolution, codec, grp AS "group"
     FROM media_files WHERE kind = ? AND tmdb_id = ?`,
    kind,
    String(tmdbId),
  );
}
