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
});
