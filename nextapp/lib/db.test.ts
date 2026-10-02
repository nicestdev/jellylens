import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./db";

describe("openDatabase", () => {
  it("creates the whole schema on an empty database in one step", () => {
    const conn = openDatabase(":memory:");
    expect(conn.pragma("user_version", { simple: true })).toBe(1);
    const tables = conn
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((t) => (t as { name: string }).name);
    expect(tables).toEqual(expect.arrayContaining(["release_groups", "releases", "media_files", "wcx", "requests"]));
    expect(conn.prepare("SELECT size_mb FROM releases").all()).toEqual([]);
  });

  it("refuses a database at a schema version it doesn't know", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jellylens-db-"));
    const file = path.join(dir, "jellylens.db");
    try {
      const old = new Database(file);
      old.pragma("user_version = 4");
      old.close();
      expect(() => openDatabase(file)).toThrow(/schema version 4.*before 0\.13\.0/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
