import { describe, expect, it } from "vitest";
import type { OrganizeItem, OrganizeMoved, OrganizeResponse } from "@/lib/api-types";
import type { LibraryTarget, MoveProgress } from "@/lib/library-move";
import { defaultTarget, destination, fits, organizeGroups, isMoving, targetOf } from "./logic";

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
  back: false,
  done: 0,
  total: GB,
  phase: "copying",
  speed: 0,
  running: true,
  error: null,
  ...over,
});
const moved = (id: number, over: Partial<OrganizeMoved> = {}): OrganizeMoved => ({
  id,
  name: `Heat.${id}`,
  media: null,
  movedTo: "nvme01/movies/Heat (1995) [tmdbid-949]",
  movedAt: "2026-10-09T10:00:00.000Z",
  files: ["Heat.mkv"],
  bytes: GB,
  replaced: false,
  move: null,
  ...over,
});
const response = (items: OrganizeItem[], movedItems: OrganizeMoved[] = []): OrganizeResponse => ({
  ready: true,
  libraryDir: "/library",
  disks: [],
  items,
  moved: movedItems,
});

describe("defaultTarget", () => {
  it("is the disk that has the title, else the first it fits on, not the roomiest", () => {
    expect(defaultTarget(item(1))?.disk).toBe("nvme02");
    const has = item(1, { targets: [target("nvme01", 50 * GB), target("nvme02", 1 * GB, "Heat (1995) [tmdbid-949]")] });
    expect(defaultTarget(has)?.disk).toBe("nvme02");
    expect(defaultTarget(item(1, { targets: [target("nvme01", GB)] }))).toBeNull();
  });

  it("counts a disk whose free space can't be read as fitting", () => {
    expect(fits(item(1), target("nvme09", null))).toBe(true);
  });
});

describe("targetOf", () => {
  it("is the disk being moved to, else the one picked, else the default", () => {
    expect(targetOf(item(1), "/library/nvme03/movies")?.disk).toBe("nvme03");
    expect(targetOf(item(1, { move: progress() }), "/library/nvme03/movies")?.disk).toBe("nvme02");
    expect(targetOf(item(1), "/library/gone/movies")?.disk).toBe("nvme02");
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

describe("organizeGroups", () => {
  it("splits into New, Running (moves and Undos) and Finished, leaving empty ones out", () => {
    const data = response(
      [item(1), item(2, { move: progress() }), item(3, { error: "No video in it." })],
      [moved(4), moved(5, { move: progress({ back: true, error: "gone" }) })],
    );
    expect(organizeGroups(data).map((g) => [g.title, [...g.items, ...g.moved].map((i) => i.id)])).toEqual([
      ["New", [1, 3]],
      ["Running", [2, 5]],
      ["Finished", [4]],
    ]);
    expect(organizeGroups(response([item(1)])).map((g) => g.title)).toEqual(["New"]);
  });
});

describe("isMoving", () => {
  it("is true while a move or an Undo waits or runs, not after it failed", () => {
    expect(isMoving(response([item(1)]))).toBe(false);
    expect(isMoving(response([item(1, { move: progress({ running: false }) })]))).toBe(true);
    expect(isMoving(response([], [moved(1, { move: progress({ back: true }) })]))).toBe(true);
    expect(isMoving(response([item(1, { move: progress({ error: "x" }) })]))).toBe(false);
  });
});
