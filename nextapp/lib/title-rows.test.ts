import { describe, expect, it } from "vitest";
import type { LibraryCopy, TitleRelease, WcxRelease } from "./api-types";
import {
  allRowsOf,
  combineRows,
  facetValues,
  formatFacet,
  keepRow,
  libraryNote,
  noRowFilters,
  toggleFilter,
  wcxRow,
  xrelRow,
  RELEASE_SORTS,
  sortRows,
  type ReleaseRow,
  type ReleaseSortKey,
} from "./title-rows";

const xrel = (name: string, over: Partial<TitleRelease> = {}): TitleRelease => ({
  id: name,
  name,
  link: "https://www.xrel.to/" + name,
  quality: "HD-1080p",
  publishedAt: 1790000000,
  group: "VECTOR",
  sizeMb: null,
  ...over,
});
const wcx = (name: string, over: Partial<WcxRelease> = {}): WcxRelease => ({
  uid: "w-" + name,
  name,
  group: "FuN",
  quality: null,
  seasons: null,
  size: null,
  createdAt: null,
  mirrors: [],
  ...over,
});
const copy = (over: Partial<LibraryCopy> = {}): LibraryCopy => ({
  season: null,
  episode: null,
  episodeEnd: null,
  resolution: "1080p",
  codec: "x264",
  group: "VECTOR",
  ...over,
});

describe("xrelRow and wcxRow", () => {
  it("read resolution, codec, audio, size and seasons the same way for both", () => {
    expect(
      xrelRow(xrel("Silo.S01.German.DL.2160p.WEB.h265-VECTOR", { quality: "HD-2160p", sizeMb: 2, episodes: 3 })),
    ).toEqual({
      id: "Silo.S01.German.DL.2160p.WEB.h265-VECTOR",
      name: "Silo.S01.German.DL.2160p.WEB.h265-VECTOR",
      episodes: 3,
      group: "VECTOR",
      resolution: "2160p",
      codec: "x265",
      audio: "DL",
      size: 2 * 1024 * 1024,
      date: 1790000000,
      seasons: [1, 1],
    });
    expect(
      wcxRow(wcx("Silo.S01-S02.German.1080p.WEB.h264-FuN", { size: 5, createdAt: "2026-10-08T00:00:00Z" })),
    ).toMatchObject({
      id: "w-Silo.S01-S02.German.1080p.WEB.h264-FuN",
      episodes: null,
      resolution: "1080p",
      size: 5,
      date: Date.UTC(2026, 9, 8) / 1000,
      seasons: [1, 2],
    });
  });

  it("puts every title's releases and WCX's in one list", () => {
    const rows = allRowsOf([{ Items: [xrel("A")] }, { Items: [xrel("B")] }], [wcx("C")]);
    expect(rows.map((r) => r.id)).toEqual(["A", "B", "w-C"]);
  });
});

describe("the toolbar", () => {
  const rows = [
    xrelRow(xrel("Silo.S02.German.DL.720p.WEB.h264-VECTOR", { quality: "HD-720p" })),
    xrelRow(xrel("Silo.S01.German.DL.2160p.WEB.h265-VECTOR", { quality: "HD-2160p" })),
    wcxRow(wcx("Silo.S01-S03.German.DVDRip.XviD-FuN", { quality: "SD" })),
  ];

  it("offers qualities best first and seasons in order", () => {
    expect(facetValues("resolution", rows)).toEqual(["2160p", "720p", "SD"]);
    expect(facetValues("season", rows)).toEqual(["1", "2", "3"]);
    expect(formatFacet("resolution", "2160p")).toBe("4K");
    expect(formatFacet("season", "2")).toBe("S02");
    expect(formatFacet("season", "0")).toBe("Specials");
  });

  it("keeps rows with every word, any picked value of a facet, and a pack for each season", () => {
    expect(rows.filter(keepRow("silo web", noRowFilters())).length).toBe(2);
    const season3 = toggleFilter(noRowFilters(), "season", "3");
    expect(rows.filter(keepRow("", season3)).map((r) => r.group)).toEqual(["FuN"]);
    const twoQualities = toggleFilter(toggleFilter(noRowFilters(), "resolution", "720p"), "resolution", "SD");
    expect(rows.filter(keepRow("", twoQualities)).length).toBe(2);
    expect(toggleFilter(twoQualities, "resolution", "SD").resolution).toEqual(new Set(["720p"]));
  });
});

describe("libraryNote", () => {
  const movie = xrelRow(xrel("Heat.1995.German.DL.1080p.BluRay.x264-VECTOR"));
  const pack = xrelRow(xrel("Silo.S01.German.DL.1080p.WEB.h264-VECTOR"));
  const episode = xrelRow(xrel("Silo.S01E02.German.DL.1080p.WEB.h264-VECTOR"));

  it("names a movie's copies", () => {
    expect(libraryNote(movie, [copy(), copy({ resolution: "2160p", codec: "x265", group: null })], true)).toBe(
      "In library\nYou have: 1080p · x264 · VECTOR, 2160p · x265",
    );
    expect(libraryNote(movie, [], true)).toBeNull();
  });

  it("counts a season's episodes, or says one episode is there", () => {
    const copies = [copy({ season: 1, episode: 1 }), copy({ season: 1, episode: 2, episodeEnd: 3 })];
    expect(libraryNote(pack, copies, false)).toBe("S01: 2 episodes in library\nYou have: 1080p · x264 · VECTOR");
    expect(libraryNote(episode, copies, false)).toBe("In library\nYou have: 1080p · x264 · VECTOR");
    expect(libraryNote(pack, [copy({ season: 2, episode: 1 })], false)).toBeNull();
  });
});

describe("combineRows", () => {
  const live = {
    hoster: "ddownload.com",
    source: "wcx" as const,
    links: 1,
    route: "ddownload",
    offline: false,
    container: null,
  };
  const dead = { ...live, offline: true };

  it("gives a release xREL and WCX both list one row, by its name in any case", () => {
    const name = "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR";
    const copy = wcx(name.toUpperCase(), { size: 7 });
    const rows = combineRows([xrelRow(xrel(name, { sizeMb: 1 }))], [copy]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: name, name, xrel: true, size: 1024 * 1024, wcx: [copy] });
  });

  it("takes the size from WCX's first copy when xREL has none", () => {
    const name = "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR";
    const rows = combineRows([xrelRow(xrel(name))], [wcx(name, { size: 7 }), wcx(name, { uid: "b", size: 9 })]);
    expect(rows[0].size).toBe(7);
    expect(combineRows([xrelRow(xrel(name))], [])[0]).toMatchObject({ size: null, xrel: true, wcx: [] });
  });

  it("makes a row of WCX's first copy of a release xREL doesn't have", () => {
    const first = wcx("Heat.1995.German.DL.2160p.WEB.h265-FuN", { uid: "a", size: 5 });
    const second = wcx("heat.1995.german.dl.2160p.web.h265-fun", { uid: "b", size: 6 });
    const rows = combineRows([], [first, second]);
    expect(rows).toEqual([{ ...wcxRow(first), xrel: false, wcx: [first, second] }]);
  });

  it("lists the copies with a live mirror first", () => {
    const name = "Heat.1995.German.DL.2160p.WEB.h265-FuN";
    const gone = wcx(name, { uid: "gone", mirrors: [dead] });
    const none = wcx(name, { uid: "none" });
    const up = wcx(name, { uid: "up", mirrors: [dead, live] });
    const rows = combineRows([], [gone, none, up]);
    expect(rows[0].wcx.map((r) => r.uid)).toEqual(["up", "gone", "none"]);
    // The row is the live one's.
    expect(rows[0].id).toBe("up");
  });

  it("puts the newest first, one without a date last", () => {
    const rows = combineRows(
      [xrelRow(xrel("Old", { publishedAt: 1000 })), xrelRow(xrel("New", { publishedAt: 3000 }))],
      [wcx("Undated"), wcx("Middle", { createdAt: new Date(2000 * 1000).toISOString() })],
    );
    expect(rows.map((r) => r.name)).toEqual(["New", "Middle", "Old", "Undated"]);
  });
});

describe("sortRows", () => {
  const row = (id: string, date: number | null, size: number | null, name = id): ReleaseRow => ({
    id,
    name,
    episodes: null,
    group: null,
    resolution: null,
    codec: "",
    audio: null,
    size,
    date,
    seasons: null,
  });
  const rows = [row("b", 2, 30), row("a", 3, null), row("c", null, 10)];
  const ids = (key: ReleaseSortKey, dir: "asc" | "desc") => sortRows(rows, key, dir).map((r) => r.id);

  it("sorts by date, size or name, a row without one last either way", () => {
    expect(RELEASE_SORTS[0]).toMatchObject({ key: "date", defaultDir: "desc" });
    expect(ids("date", "desc")).toEqual(["a", "b", "c"]);
    expect(ids("date", "asc")).toEqual(["b", "a", "c"]);
    expect(ids("size", "desc")).toEqual(["b", "c", "a"]);
    expect(ids("name", "asc")).toEqual(["a", "b", "c"]);
  });
});
