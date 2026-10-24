import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./db";

describe("openDatabase", () => {
  it("creates the whole schema on an empty database, up to the latest version", () => {
    const conn = openDatabase(":memory:");
    expect(conn.pragma("user_version", { simple: true })).toBe(6);
    const tables = conn
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((t) => (t as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "release_groups",
        "releases",
        "media_files",
        "wcx",
        "requests",
        "download_packages",
        "download_files",
        "download_settings",
        "dload_users",
        "dload_threads",
      ]),
    );
    expect(conn.prepare("SELECT size_mb FROM releases").all()).toEqual([]);
    expect(conn.prepare("SELECT moved_to, moved_at, moved_files FROM download_packages").all()).toEqual([]);
  });

  it("keeps only the whole shows ignored, drops the old missing stage's sync time, keeps the releases", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jellylens-db-"));
    const file = path.join(dir, "jellylens.db");
    try {
      const old = new Database(file);
      old.exec(`
        CREATE TABLE ignored (show_id TEXT NOT NULL, season INTEGER);
        INSERT INTO ignored VALUES ('a', 2), ('b', NULL), ('a', NULL), ('c', 1);
        CREATE TABLE sync_state (stage TEXT PRIMARY KEY, synced_at TEXT NOT NULL);
        CREATE TABLE download_files (id INTEGER PRIMARY KEY);
        INSERT INTO sync_state VALUES ('missing', 'x'), ('tmdb', 'y');
        CREATE TABLE release_groups (id TEXT PRIMARY KEY);
        INSERT INTO release_groups VALUES ('g1');
        CREATE TABLE releases (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES release_groups ON DELETE CASCADE,
          title_key TEXT, name TEXT, link TEXT, type TEXT, quality TEXT, published_at INTEGER, imdb_id TEXT, search TEXT, size_mb INTEGER);
        INSERT INTO releases VALUES ('r1', 'g1', 'e1', 'Heat-FuN', '', 'movie', 'HD-1080p', 1, NULL, 'heat-fun', NULL);
      `);
      old.pragma("user_version = 1");
      old.close();
      const conn = openDatabase(file);
      expect(conn.prepare("SELECT show_id FROM ignored ORDER BY rowid").pluck().all()).toEqual(["b", "a"]);
      expect(conn.prepare("SELECT stage FROM sync_state").pluck().all()).toEqual(["tmdb"]);
      // The releases stay, now with room for WCX's (no group of their own).
      expect(conn.prepare("SELECT id, group_id, group_name FROM releases").all()).toEqual([
        { id: "r1", group_id: "g1", group_name: null },
      ]);
      conn
        .prepare(
          "INSERT INTO releases (id, title_key, name, link, type, quality, published_at, search) VALUES ('wcx:1', 'wcx:a', 'n', '', 'movie', '', 1, 'n')",
        )
        .run();
      conn.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a database at a schema version it doesn't know", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jellylens-db-"));
    const file = path.join(dir, "jellylens.db");
    try {
      const old = new Database(file);
      old.pragma("user_version = 7");
      old.close();
      expect(() => openDatabase(file)).toThrow(/schema version 7.*run the newer Jellylens/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
