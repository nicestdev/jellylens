import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { DATA_DIR } from "./env";
import { log } from "./log";

// All of Jellylens' state lives in one SQLite file in DATA_DIR. Library and
// TMDB items keep the handful of fields we look things up by as columns and
// the rest as JSON (`data`).
const DB_FILE = path.join(DATA_DIR, "jellylens.db");

// One entry per schema version, applied in order and tracked in
// PRAGMA user_version. Never edit one that has shipped; add a new one.
const MIGRATIONS: string[] = [
  `
  -- When each sync stage last finished.
  CREATE TABLE sync_state (stage TEXT PRIMARY KEY, synced_at TEXT NOT NULL);
  -- Display options from the Settings page; value is JSON.
  CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  -- ---- The library, from LIBRARY_DIR's disks (lib/library-scan.ts)

  -- A movie's and a show's id is its TMDB id; data: the fields Jellylens
  -- reads (lib/store/library.ts).
  CREATE TABLE movies (id TEXT PRIMARY KEY, tmdb_id TEXT, data TEXT NOT NULL);
  CREATE TABLE shows (id TEXT PRIMARY KEY, tmdb_id TEXT, data TEXT NOT NULL);
  -- id: "<show>:<season>:<episode>"; number_end: the last of a combined
  -- file's episodes. audio_languages: JSON array of codes (lib/languages.ts).
  CREATE TABLE episodes (
    id TEXT PRIMARY KEY,
    show_id TEXT NOT NULL,
    season INTEGER,
    number INTEGER,
    number_end INTEGER,
    size INTEGER NOT NULL,
    audio_languages TEXT NOT NULL
  );
  CREATE INDEX episodes_series ON episodes (show_id);
  -- What ffprobe read from a file (JSON, lib/ffprobe.ts), by its path under
  -- LIBRARY_DIR; probed again only when its size or mtime changes.
  CREATE TABLE probes (path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime INTEGER NOT NULL, data TEXT NOT NULL);

  -- Every file of the library (lib/analytics.ts reads the group, resolution
  -- and codec), so the file lists search, filter and page in SQL. kind: movie
  -- or episode. item_id: the movie or episode; parent_id: the movie, or the
  -- episode's show. title, year, tmdb_id: the movie's or the show's. season,
  -- episode, episode_end, episode_title: an episode's (NULL for movies).
  -- path: under LIBRARY_DIR ("nvme01/movies/Heat (1995) [tmdbid-949]/Heat….mkv").
  -- grp: the release group as first spelled in the library, NULL if none;
  -- grp_key: lowercased, to tell groups apart. resolution, codec: labels
  -- ("4K", "x265"), "" if unknown. languages: the audio's, as a JSON array
  -- of codes ('["DE","EN"]'), '[]' if none is tagged. search: titles and
  -- file name, folded.
  CREATE TABLE media_files (
    kind TEXT NOT NULL CHECK (kind IN ('movie', 'episode')),
    item_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    parent_id TEXT NOT NULL,
    title TEXT NOT NULL,
    year INTEGER,
    tmdb_id TEXT,
    season INTEGER,
    episode INTEGER,
    episode_end INTEGER,
    episode_title TEXT,
    file_name TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER NOT NULL,
    grp TEXT,
    grp_key TEXT,
    resolution TEXT NOT NULL,
    codec TEXT NOT NULL,
    languages TEXT NOT NULL,
    search TEXT NOT NULL,
    PRIMARY KEY (kind, item_id, idx)
  );
  CREATE INDEX media_files_grp ON media_files (kind, grp_key);

  -- ---- TMDB, and what the missing recheck derives from it

  -- A library title's details (JSON, lib/tmdb.ts TmdbDetails) in
  -- TMDB_LANGUAGE: name, genres, poster, a show's status. Fetched by the
  -- scan for new titles, refreshed by the TMDB sync.
  CREATE TABLE tmdb_details (
    media_type TEXT NOT NULL,
    tmdb_id TEXT NOT NULL,
    data TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (media_type, tmdb_id)
  );
  CREATE TABLE tmdb_shows (show_id TEXT PRIMARY KEY, tmdb_id TEXT NOT NULL, seasons TEXT NOT NULL);
  CREATE TABLE missing_shows (show_id TEXT PRIMARY KEY, data TEXT NOT NULL);
  -- A show's missing episodes dismissed on the Dashboard: a season, or the
  -- whole show (season NULL).
  CREATE TABLE ignored (show_id TEXT NOT NULL, season INTEGER);
  CREATE UNIQUE INDEX ignored_entry ON ignored (show_id, ifnull(season, -1));

  -- ---- The wishlist: one request per title, with everyone who asked

  CREATE TABLE requests (
    media_type TEXT NOT NULL,
    tmdb_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    year INTEGER,
    release_date TEXT,
    poster_path TEXT,
    requested_at TEXT NOT NULL,
    PRIMARY KEY (media_type, tmdb_id)
  );
  CREATE TABLE requesters (
    media_type TEXT NOT NULL,
    tmdb_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    PRIMARY KEY (media_type, tmdb_id, user_id),
    FOREIGN KEY (media_type, tmdb_id) REFERENCES requests ON DELETE CASCADE
  );

  -- ---- Releases (xREL)

  -- Favorite groups. kind p2p: id = xREL's API id; kind scene: xREL has
  -- none, so id = 'scene:' || name. complete: the group's whole list has
  -- been fetched once (a scene group's search, once); later syncs only fetch
  -- what's new.
  CREATE TABLE release_groups (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('p2p', 'scene')),
    name TEXT NOT NULL,
    added_at TEXT NOT NULL,
    synced_at TEXT,
    complete INTEGER NOT NULL DEFAULT 0
  );
  -- title_key: xREL's id for the movie or show, so a title's releases share
  -- one tile. imdb_id: the IMDb id xREL links it to, which is sometimes
  -- wrong (see title_matches). search: the name, folded for LIKE. size_mb:
  -- how big it is (xREL's, NULL if it gives none).
  CREATE TABLE releases (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES release_groups ON DELETE CASCADE,
    title_key TEXT NOT NULL,
    name TEXT NOT NULL,
    link TEXT NOT NULL,
    type TEXT NOT NULL,
    quality TEXT NOT NULL,
    published_at INTEGER NOT NULL,
    imdb_id TEXT,
    search TEXT NOT NULL,
    size_mb INTEGER
  );
  CREATE INDEX releases_group ON releases (group_id);
  CREATE INDEX releases_title ON releases (title_key);
  CREATE INDEX releases_imdb ON releases (imdb_id);
  -- The TMDB entry behind each IMDb id xREL gave: only a candidate for its
  -- titles. tmdb_id NULL = TMDB doesn't know it (asked again after a while).
  CREATE TABLE imdb_lookups (
    imdb_id TEXT PRIMARY KEY,
    media_type TEXT,
    tmdb_id INTEGER,
    title TEXT,
    original_title TEXT,
    year INTEGER,
    poster_path TEXT,
    checked_at TEXT NOT NULL
  );
  -- What Discover shows per title, checked against its release names
  -- (lib/title-match.ts). status: verified (xREL's link checked out),
  -- searched (found by a TMDB search instead), unverified (neither: title and
  -- year from the release name, nothing from TMDB), confirmed / rejected
  -- (decided by hand, see match_overrides). search: the titles, folded.
  CREATE TABLE title_matches (
    title_key TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('verified', 'searched', 'unverified', 'confirmed', 'rejected')),
    media_type TEXT,
    tmdb_id INTEGER,
    title TEXT NOT NULL,
    year INTEGER,
    poster_path TEXT,
    search TEXT NOT NULL,
    checked_at TEXT NOT NULL
  );
  -- A decision from a title page's ⋯ menu; survives every sync. verdict:
  -- wrong (show nothing from TMDB) or xrel (take xREL's link although it
  -- didn't check out).
  CREATE TABLE match_overrides (
    title_key TEXT PRIMARY KEY,
    verdict TEXT NOT NULL CHECK (verdict IN ('wrong', 'xrel')),
    created_at TEXT NOT NULL
  );
  -- WCX pages by TMDB entry ("movie:949"). A found uid doesn't change; uid
  -- NULL = WCX had nothing (or the entry has no IMDb id), asked again after
  -- a while.
  CREATE TABLE wcx (tmdb_id TEXT PRIMARY KEY, uid TEXT, checked_at TEXT NOT NULL);

  -- ---- The Queue: a package per DLC container, pasted links or WCX
  -- mirror, its files downloaded a few at a time, its archives extracted as
  -- they come in, then moved into the library.

  -- status: pending (not started yet), paused, queued, downloading,
  -- extracting, done, failed. dir: its folder under DOWNLOAD_DIR.
  -- started_at: when it was started; the queue goes by it. media_type,
  -- tmdb_id, title, year, poster_path: the TMDB entry its name points to
  -- (lib/download-match.ts), NULL if none; matched_at: when that was looked
  -- up, NULL = not yet. library_choice: what was said about what the
  -- library has of it when it was started, 'replace' (the old files go once
  -- it's moved) or 'skip' (the episodes it has are left out); NULL if it had
  -- nothing of it. moved_to, moved_at, moved_files: the folder under
  -- LIBRARY_DIR its files went to, when, and which went where (JSON
  -- [{ from, to }], for Undo; lib/library-move.ts); its own folder under
  -- DOWNLOAD_DIR is gone then. moved_replaced: moved in by Replace, what the
  -- library had of it taken out, so there's no Undo.
  CREATE TABLE download_packages (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    dir TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    media_type TEXT,
    tmdb_id INTEGER,
    title TEXT,
    year INTEGER,
    poster_path TEXT,
    matched_at TEXT,
    library_choice TEXT,
    moved_to TEXT,
    moved_at TEXT,
    moved_files TEXT,
    moved_replaced INTEGER NOT NULL DEFAULT 0
  );
  -- status: queued, downloading, done, extracted (its archive came out and
  -- it's deleted), skipped (left out at the start), failed. name, size:
  -- from the hoster once it's resolved (the container's guess until then,
  -- size NULL if unknown); received: bytes on disk.
  CREATE TABLE download_files (
    id INTEGER PRIMARY KEY,
    package_id INTEGER NOT NULL REFERENCES download_packages ON DELETE CASCADE,
    url TEXT NOT NULL,
    name TEXT NOT NULL,
    size INTEGER,
    received INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    error TEXT
  );
  CREATE INDEX download_files_package ON download_files (package_id);
  -- The queue's settings (parallel downloads, archive passwords); value is JSON.
  CREATE TABLE download_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  `
  -- Only whole shows are ignored: a season's ignore goes, the shows stay.
  CREATE TABLE ignored_shows (show_id TEXT PRIMARY KEY);
  INSERT OR IGNORE INTO ignored_shows SELECT show_id FROM ignored WHERE season IS NULL ORDER BY rowid;
  DROP TABLE ignored;
  ALTER TABLE ignored_shows RENAME TO ignored;
  -- The incomplete shows are no sync stage of their own anymore.
  DELETE FROM sync_state WHERE stage = 'missing';
  `,
  // A file's name inside its archive, read from the archive's first bytes.
  `
  ALTER TABLE download_files ADD COLUMN inner_name TEXT;
  `,
  // WCX's releases (lib/sync-wcx.ts) belong to no favorite group: group_id
  // NULL, their group by the name in group_name (NULL for xREL's, whose
  // group is group_id's). SQLite can't loosen NOT NULL in place, so the
  // table is copied; nothing references it.
  `
  CREATE TABLE releases_new (
    id TEXT PRIMARY KEY,
    group_id TEXT REFERENCES release_groups ON DELETE CASCADE,
    group_name TEXT,
    title_key TEXT NOT NULL,
    name TEXT NOT NULL,
    link TEXT NOT NULL,
    type TEXT NOT NULL,
    quality TEXT NOT NULL,
    published_at INTEGER NOT NULL,
    imdb_id TEXT,
    search TEXT NOT NULL,
    size_mb INTEGER
  );
  INSERT INTO releases_new (id, group_id, title_key, name, link, type, quality, published_at, imdb_id, search, size_mb)
    SELECT id, group_id, title_key, name, link, type, quality, published_at, imdb_id, search, size_mb FROM releases;
  DROP TABLE releases;
  ALTER TABLE releases_new RENAME TO releases;
  CREATE INDEX releases_group ON releases (group_id);
  CREATE INDEX releases_title ON releases (title_key);
  CREATE INDEX releases_imdb ON releases (imdb_id);
  `,
  // What happened, for Logs (lib/log.ts): kept 14 days.
  `
  CREATE TABLE logs (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    level TEXT NOT NULL,
    area TEXT NOT NULL,
    message TEXT NOT NULL
  );
  CREATE INDEX logs_at ON logs (at);
  `,
];

// Opens (creating if needed) a database and brings its schema up to date.
// file ":memory:" gives a throwaway one, for tests.
export function openDatabase(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new Database(file);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  // Dev and prod may share the data volume; wait for the other's write.
  conn.pragma("busy_timeout = 5000");
  const from = migrate(conn);
  // Once db() has the connection, so the line lands in it too.
  if (from < MIGRATIONS.length && file !== ":memory:") queueMicrotask(() => logMigrated(from));
  return conn;
}

const logMigrated = (from: number) => log.info("db", `Migrated from schema version ${from} to ${MIGRATIONS.length}`);

// The version it was at.
function migrate(conn: Database.Database): number {
  const version = conn.pragma("user_version", { simple: true }) as number;
  // Newer than this code knows: a newer Jellylens wrote it. Rather than run
  // on a schema it doesn't match, stop here.
  if (version > MIGRATIONS.length) {
    throw new Error(
      `jellylens.db is at schema version ${version}, which this Jellylens doesn't know (it knows up to ` +
        `${MIGRATIONS.length}): run the newer Jellylens that wrote it.`,
    );
  }
  for (let v = version; v < MIGRATIONS.length; v++) {
    conn.transaction(() => {
      conn.exec(MIGRATIONS[v]);
      conn.pragma(`user_version = ${v + 1}`);
    })();
  }
  return version;
}

// One connection per process, opened on first use. Kept on globalThis so
// `next dev` module reloads don't open another; a reload that brings a new
// migration runs it on that connection (migrated: how many it has run).
const globalForDb = globalThis as unknown as { __jellylensDb?: Database.Database; __jellylensMigrated?: number };

export function db(): Database.Database {
  globalForDb.__jellylensDb ??= openDatabase(DB_FILE);
  if (globalForDb.__jellylensMigrated !== MIGRATIONS.length) {
    const from = migrate(globalForDb.__jellylensDb);
    if (from < MIGRATIONS.length) logMigrated(from);
    globalForDb.__jellylensMigrated = MIGRATIONS.length;
  }
  return globalForDb.__jellylensDb;
}

// Swaps in another connection (tests use a fresh in-memory one each).
export function useDatabase(conn: Database.Database) {
  globalForDb.__jellylensDb = conn;
}

// Runs fn in one transaction: all of it lands, or none of it. Nested calls
// become savepoints.
export function tx<T>(fn: () => T): T {
  return db().transaction(fn)();
}

export const toJson = (value: unknown) => JSON.stringify(value);
export const fromJson = <T>(text: string): T => JSON.parse(text) as T;
