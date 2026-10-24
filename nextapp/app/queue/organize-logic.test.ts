import { describe, expect, it } from "vitest";
import type { OrganizeItem, OrganizeResponse } from "@/lib/api-types";
import type { LibraryTarget, MoveProgress } from "@/lib/library-move";
import { defaultTarget, destination, fits, isMoving, replaceable, targetOf } from "./organize-logic";

const GB = 1e9;
const target = (disk: string, freeBytes: number | null, existing: string | null = null): LibraryTarget => ({
  path: `/library/${disk}/movies`,
  disk,
  freeBytes,
  existing,
});
const item = (id: number, over: Partial<OrganizeItem> = {}): OrganizeItem => ({
  id,
  name: `Heat.${id}`,
  media: { type: "movie", tmdbId: 949, title: "Heat", year: 1995, posterPath: null },
  folder: "Heat (1995) [tmdbid-949]",
  files: ["Heat.mkv"],
  bytes: 5 * GB,
  error: null,
  targets: [target("nvme01", 2 * GB), target("nvme02", 100 * GB), target("nvme03", 500 * GB)],
  owned: [],
  move: null,
  ...over,
});
const progress = (over: Partial<MoveProgress> = {}): MoveProgress => ({
  target: "/library/nvme02/movies",
  done: 0,
  total: GB,
  speed: 0,
  running: true,
  error: null,
  ...over,
});
const response = (items: OrganizeItem[]): OrganizeResponse => ({
  ready: true,
  libraryDir: "/library",
  disks: [],
  items,
  moved: [],
});

describe("defaultTarget", () => {
  it("is the disk that has the title, else none: a new title's is picked by hand", () => {
    expect(defaultTarget(item(1))).toBeNull();
    const has = item(1, { targets: [target("nvme01", 50 * GB), target("nvme02", 1 * GB, "Heat (1995) [tmdbid-949]")] });
    expect(defaultTarget(has)?.disk).toBe("nvme02");
  });

  it("counts a disk whose free space can't be read as fitting", () => {
    expect(fits(item(1), target("nvme09", null))).toBe(true);
  });
});

describe("targetOf", () => {
  it("is the disk being moved to, else the one picked, else the default", () => {
    expect(targetOf(item(1), "/library/nvme03/movies")?.disk).toBe("nvme03");
    expect(targetOf(item(1, { move: progress() }), "/library/nvme03/movies")?.disk).toBe("nvme02");
    expect(targetOf(item(1), "/library/gone/movies")).toBeNull();
  });
});

describe("destination", () => {
  it("is the kind's folder on the disk and the title's folder, the one the disk has", () => {
    expect(destination(item(1), target("nvme02", GB))).toEqual({
      root: "nvme02/movies",
      folder: "Heat (1995) [tmdbid-949]",
    });
    expect(destination(item(1), target("nvme02", GB, "Heat [tmdbid-949]")).folder).toBe("Heat [tmdbid-949]");
    expect(destination(item(1), null)).toEqual({ root: null, folder: "Heat (1995) [tmdbid-949]" });
  });
});

describe("isMoving", () => {
  it("is true while a move waits or runs, not after it failed", () => {
    expect(isMoving(response([item(1)]))).toBe(false);
    expect(isMoving(response([item(1, { move: progress({ running: false }) })]))).toBe(true);
    expect(isMoving(response([item(1, { move: progress({ error: "x" }) })]))).toBe(false);
  });
});

describe("replaceable", () => {
  it("is what the library has, ready to go, with its disk: not new, failed, moving or without a disk", () => {
    const owned = [{ path: "nvme02/movies/Heat (1995) [tmdbid-949]/Heat.mkv", size: GB, extras: [] }];
    const has = [target("nvme02", 100 * GB, "Heat (1995) [tmdbid-949]")];
    const rows = replaceable(
      [
        item(1, { owned, targets: has }),
        item(2, { owned }),
        item(3, { owned, targets: has, error: "No video in it." }),
        item(4, { owned, targets: has, move: progress() }),
        item(5, { targets: has }),
      ],
      { 2: "/library/nvme03/movies" },
    );
    expect(rows.map((r) => [r.item.id, r.target.disk])).toEqual([
      [1, "nvme02"],
      [2, "nvme03"],
    ]);
  });
  it("with owned false is what Move all moves: new to the library, with a disk", () => {
    const has = [target("nvme02", 100 * GB, "Heat (1995) [tmdbid-949]")];
    const owned = [{ path: "nvme02/movies/Heat (1995) [tmdbid-949]/Heat.mkv", size: GB, extras: [] }];
    const rows = replaceable(
      [item(1, { targets: has }), item(2), item(3, { owned, targets: has })],
      { 2: "/library/nvme03/movies" },
      false,
    );
    expect(rows.map((r) => [r.item.id, r.target.disk])).toEqual([
      [1, "nvme02"],
      [2, "nvme03"],
    ]);
  });
});
