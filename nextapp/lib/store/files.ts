import { db } from "../db";
import { all, one, run } from "./sql";

// The library's files for Analytics (media_files in lib/db.ts), written
// with the library by replaceLibrary: the movies' and the episodes'.
// Everything the page shows is counted, searched, filtered and paged here
// in SQL, never in the browser (a show library has tens of thousands).

import type { Library } from "../libraries";

export type { Library };
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

// ---- Totals, for the tiles and the share chart

export type FileTotals = { files: number; size: number };
// value: a group's name (null: none), a resolution or a codec ("" unknown).
export type FilePart<V = string> = FileTotals & { value: V };

// titles: every movie or show; withFiles: those with files stored.
// pending: titles but no files yet (stored before the files were, until
// the next sync).
export function fileSummary(library: Library): FileTotals & { titles: number; withFiles: number; pending: boolean } {
  const r = one<{ titles: number; withFiles: number; files: number; size: number }>(
    `SELECT (SELECT count(*) FROM ${library}) AS titles, count(DISTINCT parent_id) AS withFiles,
            count(*) AS files, ifnull(sum(size), 0) AS size
       FROM media_files WHERE kind = ?`,
    KIND[library],
  )!;
  return { ...r, pending: r.titles > 0 && r.files === 0 };
}

// Files and bytes per value of a column, most files first (then the
// larger, then by name).
function partsBy<V>(library: Library, column: "grp" | "resolution" | "codec"): FilePart<V>[] {
  return all<FilePart<V>>(
    `SELECT ${column} AS value, count(*) AS files, sum(size) AS size
       FROM media_files WHERE kind = ? GROUP BY ${column === "grp" ? "grp_key" : column}
      ORDER BY files DESC, size DESC, value`,
    KIND[library],
  );
}

export const filesByGroup = (library: Library) => partsBy<string | null>(library, "grp");
export const filesByResolution = (library: Library) => partsBy<string>(library, "resolution");
export const filesByCodec = (library: Library) => partsBy<string>(library, "codec");

// Files and bytes per audio language, most files first, then "" for files
// with none tagged. A file with several counts for each, so these add up
// to more than the whole.
export function filesByLanguage(library: Library): FilePart[] {
  const tagged = all<FilePart>(
    `SELECT l.value AS value, count(*) AS files, sum(size) AS size
       FROM media_files, json_each(media_files.languages) l WHERE kind = ?
      GROUP BY l.value ORDER BY files DESC, size DESC, value`,
    KIND[library],
  );
  const none = one<FilePart>(
    `SELECT '' AS value, count(*) AS files, ifnull(sum(size), 0) AS size
       FROM media_files WHERE kind = ? AND languages = '[]'`,
    KIND[library],
  )!;
  return none.files ? [...tagged, none] : tagged;
}

// ---- The file lists

// groups: names, or null for files without one; resolutions and codecs:
// labels, "" for unknown; languages: codes, a file matching if it has any
// of them ("" for none tagged). Values of one kind are alternatives; every
// word must be in the titles, the episode's number ("s01e02") or the file
// name.
export type FileFilters = {
  words: string[];
  groups: (string | null)[];
  resolutions: string[];
  codecs: string[];
  languages: string[];
};
export type FileSort = "title" | "size" | "group";

export type FileListRow = {
  key: string;
  title: string;
  year: number | null;
  tmdbId: string | null;
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  episodeTitle: string | null;
  fileName: string;
  group: string | null;
  size: number;
  resolution: string;
  codec: string;
  languages: string[];
};

// LIKE patterns match literally: % and _ in a word are escaped.
const likeWord = (w: string) => "%" + w.replace(/[\\%_]/g, "\\$&") + "%";
const marks = (n: number) => Array.from({ length: n }, () => "?").join(", ");

function where(library: Library, f: FileFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = ["kind = ?"];
  const params: unknown[] = [KIND[library]];
  for (const w of f.words) {
    clauses.push("search LIKE ? ESCAPE '\\'");
    params.push(likeWord(w));
  }
  if (f.groups.length) {
    const named = f.groups.filter((g): g is string => g !== null).map((g) => g.toLowerCase());
    const either = [
      named.length ? `grp_key IN (${marks(named.length)})` : "",
      f.groups.includes(null) ? "grp_key IS NULL" : "",
    ];
    clauses.push("(" + either.filter(Boolean).join(" OR ") + ")");
    params.push(...named);
  }
  for (const [column, values] of [
    ["resolution", f.resolutions],
    ["codec", f.codecs],
  ] as const) {
    if (!values.length) continue;
    clauses.push(`${column} IN (${marks(values.length)})`);
    params.push(...values);
  }
  if (f.languages.length) {
    const codes = f.languages.filter(Boolean);
    const either = [
      codes.length ? `EXISTS (SELECT 1 FROM json_each(languages) WHERE value IN (${marks(codes.length)}))` : "",
      f.languages.includes("") ? "languages = '[]'" : "",
    ];
    clauses.push("(" + either.filter(Boolean).join(" OR ") + ")");
    params.push(...codes);
  }
  return { sql: "WHERE " + clauses.join(" AND "), params };
}

// Title keeps a movie's versions and a show's episodes (in order)
// together; files without a group come after every group, whichever way
// it's sorted.
const IN_TITLE = "parent_id, season, episode, item_id, idx";
const ORDER: Record<FileSort, (dir: string) => string> = {
  title: (dir) => `lower(title) ${dir}, year ${dir}, ${IN_TITLE}`,
  size: (dir) => `size ${dir}, lower(title), ${IN_TITLE}`,
  group: (dir) => `grp_key IS NULL, grp_key ${dir}, lower(title), ${IN_TITLE}`,
};

export function queryFiles(
  library: Library,
  f: FileFilters,
  sort: FileSort,
  asc: boolean,
  offset: number,
  limit: number,
): { matched: number; items: FileListRow[] } {
  const w = where(library, f);
  const rows = all<Omit<FileListRow, "languages"> & { languages: string; matched: number }>(
    `SELECT item_id || ':' || idx AS key, title, year, tmdb_id AS tmdbId, season, episode, episode_end AS episodeEnd,
            episode_title AS episodeTitle, file_name AS fileName, grp AS "group", size, resolution, codec, languages,
            count(*) OVER () AS matched
       FROM media_files ${w.sql}
      ORDER BY ${ORDER[sort](asc ? "ASC" : "DESC")}
      LIMIT ? OFFSET ?`,
    ...w.params,
    limit,
    offset,
  );
  // Past the last page there's no row to carry the count.
  const matched =
    rows[0]?.matched ??
    (offset > 0 ? one<{ n: number }>(`SELECT count(*) AS n FROM media_files ${w.sql}`, ...w.params)!.n : 0);
  return {
    matched,
    items: rows.map(({ matched: _matched, languages, ...row }) => ({
      ...row,
      languages: JSON.parse(languages) as string[],
    })),
  };
}

// What the library has of a TMDB movie or show, for the Downloads page:
// each file's name, quality, codec and group, and an episode's season and
// numbers.
export type LibraryCopy = {
  fileName: string;
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  resolution: string;
  codec: string;
  group: string | null;
};

export function libraryCopies(kind: "movie" | "episode", tmdbId: number): LibraryCopy[] {
  return all<LibraryCopy>(
    `SELECT file_name AS fileName, season, episode, episode_end AS episodeEnd, resolution, codec, grp AS "group"
     FROM media_files WHERE kind = ? AND tmdb_id = ?`,
    kind,
    String(tmdbId),
  );
}
