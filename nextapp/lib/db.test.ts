import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./db";

describe("openDatabase", () => {
  it("creates the whole schema on an empty database, up to the latest version", () => {
    const conn = openDatabase(":memory:");
    expect(conn.pragma("user_version", { simple: true })).toBe(5);
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

  it("refuses a database at a schema version it doesn't know", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jellylens-db-"));
    const file = path.join(dir, "jellylens.db");
    try {
      const old = new Database(file);
      old.pragma("user_version = 6");
      old.close();
      expect(() => openDatabase(file)).toThrow(/schema version 6.*before 0\.13\.0/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
