import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./db";

describe("openDatabase", () => {
  it("creates the whole schema on an empty database, up to the latest version", () => {
    const conn = openDatabase(":memory:");
    expect(conn.pragma("user_version", { simple: true })).toBe(2);
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
      ]),
    );
    expect(conn.prepare("SELECT size_mb FROM releases").all()).toEqual([]);
    expect(conn.prepare("SELECT moved_to, moved_at, moved_files FROM download_packages").all()).toEqual([]);
  });

  it("keeps only the whole shows ignored, and drops the old missing stage's sync time", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jellylens-db-"));
    const file = path.join(dir, "jellylens.db");
    try {
      const old = new Database(file);
      old.exec(`
        CREATE TABLE ignored (show_id TEXT NOT NULL, season INTEGER);
        INSERT INTO ignored VALUES ('a', 2), ('b', NULL), ('a', NULL), ('c', 1);
        CREATE TABLE sync_state (stage TEXT PRIMARY KEY, synced_at TEXT NOT NULL);
        INSERT INTO sync_state VALUES ('missing', 'x'), ('tmdb', 'y');
      `);
      old.pragma("user_version = 1");
      old.close();
      const conn = openDatabase(file);
      expect(conn.prepare("SELECT show_id FROM ignored ORDER BY rowid").pluck().all()).toEqual(["b", "a"]);
      expect(conn.prepare("SELECT stage FROM sync_state").pluck().all()).toEqual(["tmdb"]);
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
      old.pragma("user_version = 3");
      old.close();
      expect(() => openDatabase(file)).toThrow(/schema version 3.*run the newer Jellylens/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
