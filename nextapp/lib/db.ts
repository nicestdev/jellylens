import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { DATA_DIR } from "./env";

// All of Jellylens' state lives in one SQLite file in DATA_DIR. Jellyfin and
// TMDB items keep the handful of fields we look things up by as columns and
// the rest as JSON (`data`), since they carry many raw pass-through fields we
// never touch ourselves.
const DB_FILE = path.join(DATA_DIR, "jellylens.db");

// One entry per schema version, applied in order and tracked in
// PRAGMA user_version. Never edit one that has shipped; add a new one. (The
// first is a baseline: on 2026-10-02 every earlier version was folded into
// it, and the one existing database was copied over by hand.)
const MIGRATIONS: string[] = [
  `
  -- When each sync stage last finished, and markers for one-time imports.
  CREATE TABLE sync_state (stage TEXT PRIMARY KEY, synced_at TEXT NOT NULL);
  -- Display options from the Settings page; value is JSON.
  CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  -- ---- Jellyfin library

  CREATE TABLE movies (id TEXT PRIMARY KEY, tmdb_id TEXT, collection_id TEXT, data TEXT NOT NULL);
  CREATE TABLE shows (id TEXT PRIMARY KEY, tmdb_id TEXT, data TEXT NOT NULL);
  -- audio_languages: JSON array of codes (lib/languages.ts).
  CREATE TABLE episodes (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,
    season INTEGER,
    number INTEGER,
    number_end INTEGER,
    size INTEGER NOT NULL,
    audio_languages TEXT NOT NULL
  );
  CREATE INDEX episodes_series ON episodes (series_id);

  -- ---- TMDB, and what the missing recheck derives from it

  CREATE TABLE tmdb_series (series_id TEXT PRIMARY KEY, tmdb_id TEXT NOT NULL, seasons TEXT NOT NULL);
  CREATE TABLE tmdb_collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, poster_path TEXT, parts TEXT NOT NULL);
  CREATE TABLE missing_series (series_id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE missing_collections (collection_id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE mismatches (series_id TEXT PRIMARY KEY, data TEXT NOT NULL);

  -- Rows dismissed on the Missing page. kind missing/mismatch: target =
  -- series id, item = season; kind collection: target = collection id,
  -- item = TMDB movie id. item NULL = the whole show or collection.
  CREATE TABLE ignored (kind TEXT NOT NULL, target TEXT NOT NULL, item INTEGER);
  CREATE UNIQUE INDEX ignored_entry ON ignored (kind, target, ifnull(item, -1));

  -- ---- Requests: one per title, with everyone who asked for it

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
  -- how big it is (xREL's, NULL if it gives none; for Upgrades).
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

  -- What the Releases page shows per title, checked against its release
  -- names (lib/title-match.ts). status: verified (xREL's link checked out),
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
  -- A decision from a title's panel; survives every sync. verdict: wrong
  -- (show nothing from TMDB) or xrel (take xREL's link although it didn't
  -- check out).
  CREATE TABLE match_overrides (
    title_key TEXT PRIMARY KEY,
    verdict TEXT NOT NULL CHECK (verdict IN ('wrong', 'xrel')),
    created_at TEXT NOT NULL
  );
  -- WCX pages by TMDB entry ("movie:949"). A found uid doesn't change; uid
  -- NULL = WCX had nothing (or the entry has no IMDb id), asked again after
  -- a while.
  CREATE TABLE wcx (tmdb_id TEXT PRIMARY KEY, uid TEXT, checked_at TEXT NOT NULL);

  -- ---- Analytics: every file of the library, written by the Jellyfin sync
  -- (lib/analytics.ts reads the group, resolution and codec), so the file
  -- lists search, filter and page in SQL. kind: movie or episode. item_id:
  -- the movie or episode; parent_id: the movie, or the episode's show. title,
  -- year, tmdb_id: the movie's or the show's. season, episode, episode_end,
  -- episode_title: an episode's (NULL for movies). grp: the release group as
  -- first spelled in the library, NULL if none; grp_key: lowercased, to tell
  -- groups apart. resolution, codec: labels ("4K", "x265"), "" if unknown.
  -- languages: the audio's, as a JSON array of codes ('["DE","EN"]',
  -- lib/languages.ts), '[]' if none is tagged. search: titles and file
  -- name, folded.
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
  `,
  `
  -- ---- Downloads: a package per DLC container (or pasted links), its files
  -- downloaded a few at a time, its archives extracted as they come in.
  -- status: pending (not started yet), paused, queued, downloading,
  -- extracting, done, failed. dir: its folder under DOWNLOAD_DIR.
  -- started_at: when Start was pressed; the queue goes by it.
  -- media_type, tmdb_id, title, year, poster_path: the TMDB entry its
  -- name points to (lib/download-match.ts), NULL if none; matched_at: when
  -- that was looked up, NULL = not yet.
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
    matched_at TEXT
  );
  -- status: queued, downloading, done, extracted (its archive came out and
  -- it's deleted), skipped (left out at Start), failed. name, size: from the hoster once it's resolved
  -- (the container's guess until then, size NULL if unknown); received:
  -- bytes on disk.
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
  -- The queue's settings from the Downloads page (slots); value is JSON.
  CREATE TABLE download_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
  migrate(conn);
  return conn;
}

function migrate(conn: Database.Database) {
  const version = conn.pragma("user_version", { simple: true }) as number;
  // Newer than this code knows: a newer Jellylens wrote it, or it predates
  // the baseline (0.12.0 and before were at 2 to 6). Rather than run on a
  // schema it doesn't match, stop here.
  if (version > MIGRATIONS.length) {
    throw new Error(
      `jellylens.db is at schema version ${version}, which this Jellylens doesn't know (it knows up to ` +
        `${MIGRATIONS.length}). A database from before 0.13.0 can't be upgraded: move it away and let the syncs ` +
        `fill a new one (requests and release groups are lost), or run the newer Jellylens that wrote it.`,
    );
  }
  for (let v = version; v < MIGRATIONS.length; v++) {
    conn.transaction(() => {
      conn.exec(MIGRATIONS[v]);
      conn.pragma(`user_version = ${v + 1}`);
    })();
    console.log(`[db] migrated to schema version ${v + 1}`);
  }
}

// One connection per process, opened on first use. Kept on globalThis so
// `next dev` module reloads don't open another.
const globalForDb = globalThis as unknown as { __jellylensDb?: Database.Database };

export function db(): Database.Database {
  globalForDb.__jellylensDb ??= openDatabase(DB_FILE);
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
