import { describe, expect, it, vi } from "vitest";
import {
  addGroup,
  groupsByTile,
  hasGroupNamed,
  imdbIdOfTmdb,
  insertReleases,
  listGroups,
  markGroupSynced,
  matchInfo,
  pendingTitles,
  queryTitles,
  releaseCounts,
  removeGroup,
  saveImdbLookup,
  saveTitleMatch,
  sceneGroupId,
  setVerdict,
  setWcxUid,
  tileCount,
  tileOf,
  tileTitleKeys,
  releaseFacets,
  titleReleases,
  unlookedImdbIds,
  wcxUid,
  type TitleFilters,
  type TmdbEntry,
} from "./releases";
import { setPreferences } from "./preferences";
import { db } from "../db";
import type { Release } from "../xrel";

const release = (id: string, over: Partial<Release> = {}): Release => ({
  id,
  name: `Movie.${id}.2020.German.DL.1080p.BluRay.x265-GRP`,
  link: `https://www.xrel.to/p2p/${id}`,
  type: "movie",
  quality: "HD-1080p",
  publishedAt: 1000,
  titleKey: "t-" + id,
  imdbId: "tt" + id,
  ...over,
});

const heat: TmdbEntry = {
  mediaType: "movie",
  tmdbId: 949,
  title: "Heat",
  originalTitle: "Heat",
  year: 1995,
  posterPath: "/heat.jpg",
};
const noFilters: TitleFilters = { words: [], group: [], quality: [] };

describe("groups", () => {
  it("lists groups in the order they were added, with their release counts", () => {
    addGroup("g2", "VECTOR");
    addGroup("g1", "FuN");
    addGroup("g2", "VECTOR");
    insertReleases("g1", [release("1"), release("2")]);
    markGroupSynced("g1", "2026-06-15T00:00:00Z");
    expect(listGroups()).toEqual([
      { id: "g2", kind: "p2p", name: "VECTOR", count: 0, syncedAt: null, complete: false },
      { id: "g1", kind: "p2p", name: "FuN", count: 2, syncedAt: "2026-06-15T00:00:00Z", complete: true },
    ]);
    expect(releaseCounts()).toEqual({ groups: 2, releases: 2 });
  });

  it("keeps scene groups alongside, by name, and tells the kinds apart", () => {
    addGroup("g1", "VECTOR");
    addGroup(sceneGroupId("WAYNE"), "WAYNE", "scene");
    insertReleases(sceneGroupId("WAYNE"), [release("1")]);
    expect(listGroups().map((g) => [g.id, g.kind, g.count])).toEqual([
      ["g1", "p2p", 0],
      ["scene:WAYNE", "scene", 1],
    ]);
    expect(hasGroupNamed("vector", "p2p")).toBe(true);
    expect(hasGroupNamed("vector", "scene")).toBe(false);
    expect(hasGroupNamed("wayne", "scene")).toBe(true);
    expect(releaseCounts()).toEqual({ groups: 2, releases: 1 });
  });

  it("takes a group's releases along when it's removed", () => {
    addGroup("g1", "FuN");
    insertReleases("g1", [release("1")]);
    removeGroup("g1");
    expect(releaseCounts()).toEqual({ groups: 0, releases: 0 });
  });

  it("stores no group of a kind it doesn't know", () => {
    addGroup("x", "X", "usenet" as "p2p");
    expect(listGroups()).toEqual([]);
  });
});

describe("insertReleases", () => {
  it("tells when a page reaches releases it already has", () => {
    addGroup("g1", "FuN");
    expect(insertReleases("g1", [release("1"), release("2")])).toEqual({ added: 2, known: false });
    expect(insertReleases("g1", [release("3"), release("2")])).toEqual({ added: 1, known: true });
  });

  it("keeps each release's size, filling in one stored before sizes were", () => {
    addGroup("g1", "FuN");
    insertReleases("g1", [release("1"), release("2", { sizeMb: 4200 })]);
    const sizes = () => db().prepare("SELECT id, size_mb AS sizeMb FROM releases ORDER BY id").all();
    expect(sizes()).toEqual([
      { id: "1", sizeMb: null },
      { id: "2", sizeMb: 4200 },
    ]);
    // Seen again with a size: filled in, but not counted as new.
    expect(insertReleases("g1", [release("1", { sizeMb: 7000 }), release("2", { sizeMb: 1 })])).toEqual({
      added: 0,
      known: true,
    });
    expect(sizes()).toEqual([
      { id: "1", sizeMb: 7000 },
      { id: "2", sizeMb: 4200 },
    ]);
  });
});

describe("queryTitles", () => {
  const query = (f: Partial<TitleFilters> = {}, sort: "date" | "title" = "date", asc = false, offset = 0, limit = 60) =>
    queryTitles({ ...noFilters, ...f }, sort, asc, offset, limit);

  function seed() {
    addGroup("g1", "VECTOR");
    addGroup("g2", "FuN");
    insertReleases("g1", [
      release("1", { name: "Heat.1995.German.DL.1080p.BluRay.x265-VECTOR", titleKey: "heat", publishedAt: 300 }),
      release("2", {
        name: "Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR",
        titleKey: "heat",
        quality: "HD-2160p",
        publishedAt: 100,
      }),
      release("3", {
        name: "Ein.Muenchner.im.Himmel.2026.German.1080p-VECTOR",
        titleKey: "himmel",
        imdbId: "tt3",
        publishedAt: 200,
      }),
    ]);
    insertReleases("g2", [
      release("4", { name: "Silo.2023.S01E01.German.DL.1080p-FuN", titleKey: "silo", type: "tv", publishedAt: 50 }),
    ]);
    saveTitleMatch("heat", "verified", heat, { title: "Heat", year: 1995 });
  }

  it("gives one tile per title, newest first", () => {
    seed();
    const { matched, items } = query();
    expect(matched).toBe(3);
    expect(items.map((t) => t.key)).toEqual(["movie:949", "himmel", "silo"]);
    expect(items[0]).toMatchObject({
      title: "Heat",
      year: 1995,
      posterPath: "/heat.jpg",
      mediaType: "movie",
      tmdbId: 949,
      releases: 2,
      groups: ["VECTOR"],
      latest: 300,
    });
    expect(items[0].qualities.sort()).toEqual(["HD-1080p", "HD-2160p"]);
  });

  it("shows a release name, never xREL's title, before a title's first check", () => {
    seed();
    expect(query().items[1].title).toBe("Ein.Muenchner.im.Himmel.2026.German.1080p-VECTOR");
  });

  it("finds words in release names and checked titles, umlauts either way", () => {
    seed();
    expect(query({ words: ["muenchner", "himmel"] }).items.map((t) => t.key)).toEqual(["himmel"]);
    saveTitleMatch(
      "silo",
      "verified",
      { ...heat, tmdbId: 1, mediaType: "tv", title: "Silo – Die Zuflucht", originalTitle: "Silo" },
      { title: "Silo", year: 2023 },
    );
    expect(query({ words: ["zuflucht"] }).items.map((t) => t.key)).toEqual(["tv:1"]);
  });

  it("takes LIKE wildcards literally", () => {
    seed();
    expect(query({ words: ["%"] }).matched).toBe(0);
    expect(query({ words: ["_"] }).matched).toBe(0);
  });

  it("filters by group and quality; values of one kind are alternatives", () => {
    seed();
    expect(query({ group: ["FuN"] }).items.map((t) => t.key)).toEqual(["silo"]);
    expect(query({ quality: ["HD-2160p"] }).items.map((t) => t.key)).toEqual(["movie:949"]);
    expect(query({ quality: ["HD-2160p"] }).items[0].qualities).toEqual(["HD-2160p"]);
    expect(query({ quality: ["HD-2160p", "HD-1080p"] }).matched).toBe(3);
    expect(query({ group: ["FuN"], quality: ["HD-2160p"] }).matched).toBe(0);
  });

  it("sorts by title and pages", () => {
    seed();
    expect(query({}, "title", true).items.map((t) => t.key)).toEqual(["himmel", "movie:949", "silo"]);
    const page2 = query({}, "date", false, 2, 2);
    expect(page2.items.map((t) => t.key)).toEqual(["silo"]);
    expect(page2.matched).toBe(3);
    expect(query({}, "date", false, 10, 2)).toEqual({ matched: 3, items: [] });
  });
});

describe("releaseFacets", () => {
  it("lists the filter values A→Z; counts the tiles", () => {
    addGroup("g2", "VECTOR");
    addGroup("g1", "FuN");
    addGroup("g3", "Empty");
    insertReleases("g1", [
      release("1", { titleKey: "a", quality: "HD-2160p" }),
      release("2", { titleKey: "a", type: "tv" }),
    ]);
    insertReleases("g2", [release("3", { titleKey: "b" })]);
    expect(releaseFacets()).toEqual({
      group: ["FuN", "VECTOR"],
      quality: ["HD-1080p", "HD-2160p"],
    });
    expect(tileCount()).toBe(2);
    removeGroup("g1");
    expect(releaseFacets()).toEqual({ group: ["VECTOR"], quality: ["HD-1080p"] });
    expect(tileCount()).toBe(1);
  });
});

describe("tiles", () => {
  // xREL lists Heat twice: an old SD rip and the later BluRays. SD shown
  // here (see "releases below 720p" for hidden).
  function seed() {
    setPreferences({ showSdReleases: true });
    addGroup("g1", "VECTOR");
    insertReleases("g1", [
      release("1", {
        titleKey: "heat-sd",
        name: "Heat.German.AC3.HDRip.XViD-VECTOR",
        quality: "XviD",
        publishedAt: 100,
      }),
      release("2", {
        titleKey: "heat",
        name: "Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR",
        quality: "HD-2160p",
        publishedAt: 300,
      }),
      release("3", { titleKey: "silo", name: "Silo.2023.S01E01.German.DL.1080p-VECTOR", type: "tv", publishedAt: 200 }),
    ]);
    saveTitleMatch("heat", "verified", heat, { title: "Heat", year: 1995 });
    saveTitleMatch("heat-sd", "searched", heat, { title: "Heat", year: null });
    saveTitleMatch("silo", "unverified", null, { title: "Silo", year: 2023 });
  }
  const query = () => queryTitles(noFilters, "date", false, 0, 10);

  it("puts every xREL title matched to one TMDB entry on one tile", () => {
    seed();
    const { matched, items } = query();
    expect(matched).toBe(2);
    expect(items.map((t) => [t.key, t.releases, t.qualities.sort()])).toEqual([
      ["movie:949", 2, ["HD-2160p", "XviD"]],
      ["silo", 1, ["HD-1080p"]],
    ]);
    expect(tileCount()).toBe(2);
    expect(tileTitleKeys("movie:949")).toEqual(["heat", "heat-sd"]);
    expect(tileTitleKeys("silo")).toEqual(["silo"]);
    expect(tileOf("heat-sd")).toBe("movie:949");
  });

  it("gives a title rejected by hand a tile of its own", () => {
    seed();
    setVerdict("heat-sd", "wrong");
    saveTitleMatch("heat-sd", "rejected", null, { title: "Heat", year: null });
    expect(query().items.map((t) => t.key)).toEqual(["movie:949", "silo", "heat-sd"]);
    expect(tileTitleKeys("movie:949")).toEqual(["heat"]);
    expect(tileOf("heat-sd")).toBe("heat-sd");
    expect(tileCount()).toBe(3);
  });

  it("tells which groups released a TMDB entry, P2P and scene alike, A→Z", () => {
    seed();
    addGroup("scene:FuN", "FuN", "scene");
    insertReleases("scene:FuN", [release("4", { titleKey: "heat-web", name: "Heat.1995.1080p.WEB.H264-FuN" })]);
    saveTitleMatch("heat-web", "verified", heat, { title: "Heat", year: 1995 });
    expect(groupsByTile(["movie:949", "tv:1", "silo"])).toEqual(new Map([["movie:949", ["FuN", "VECTOR"]]]));
  });
});

describe("matching", () => {
  function seed() {
    addGroup("g1", "VECTOR");
    insertReleases("g1", [release("1", { titleKey: "heat", imdbId: "tt0113277", name: "Heat.1995.German-VECTOR" })]);
  }

  it("asks TMDB about each new IMDb id, and unknown ones again after a month", () => {
    seed();
    expect(unlookedImdbIds()).toEqual([{ imdbId: "tt0113277", type: "movie" }]);
    saveImdbLookup("tt0113277", null);
    expect(unlookedImdbIds()).toEqual([]);
    db().prepare("UPDATE imdb_lookups SET checked_at = '2000-01-01'").run();
    expect(unlookedImdbIds()).toHaveLength(1);
  });

  it("lists new titles with their names and xREL's candidate", () => {
    seed();
    saveImdbLookup("tt0113277", heat);
    expect(pendingTitles()).toEqual([
      { titleKey: "heat", type: "movie", names: ["Heat.1995.German-VECTOR"], candidate: heat, verdict: null },
    ]);
  });

  it("checks a title again when its candidate changes, and unverified ones after a month", () => {
    seed();
    saveTitleMatch("heat", "verified", heat, { title: "Heat", year: 1995 });
    expect(pendingTitles()).toEqual([]);
    saveImdbLookup("tt0113277", { ...heat, title: "Heat (new)" });
    expect(pendingTitles()).toHaveLength(1);

    saveTitleMatch("heat", "unverified", null, { title: "Heat", year: 1995 });
    expect(pendingTitles()).toEqual([]);
    db().prepare("UPDATE title_matches SET checked_at = '2000-01-01'").run();
    expect(pendingTitles()).toHaveLength(1);
  });

  it("keeps a decision and drops the match, to be worked out again", () => {
    seed();
    saveTitleMatch("heat", "verified", heat, { title: "Heat", year: 1995 });
    setVerdict("heat", "wrong");
    expect(pendingTitles()).toMatchObject([{ titleKey: "heat", verdict: "wrong" }]);
    setVerdict("heat", null);
    expect(pendingTitles()).toMatchObject([{ titleKey: "heat", verdict: null }]);
    expect(pendingTitles("heat")).toHaveLength(1);
  });

  it("tells the panel how a match came about, and xREL's candidate when it isn't shown", () => {
    seed();
    saveImdbLookup("tt0113277", heat);
    saveTitleMatch("heat", "verified", heat, { title: "Heat", year: 1995 });
    expect(matchInfo("heat")).toEqual({
      status: "verified",
      shown: { title: "Heat", year: 1995, posterPath: "/heat.jpg", mediaType: "movie", tmdbId: 949 },
      verdict: null,
      candidate: null,
    });

    saveTitleMatch("heat", "unverified", null, { title: "Heat", year: 1995 });
    expect(matchInfo("heat")).toMatchObject({
      status: "unverified",
      shown: { tmdbId: null },
      candidate: { title: "Heat", year: 1995 },
    });
  });

  it("lists a title's releases, newest first", () => {
    addGroup("g1", "VECTOR");
    insertReleases("g1", [
      release("1", { titleKey: "x", publishedAt: 1 }),
      release("2", { titleKey: "x", publishedAt: 2 }),
    ]);
    expect(titleReleases("x").map((r) => [r.id, r.group])).toEqual([
      ["2", "VECTOR"],
      ["1", "VECTOR"],
    ]);
  });
});

describe("wcx UIDs", () => {
  it("keeps a hit for good", () => {
    expect(wcxUid("movie:949")).toBeUndefined();
    setWcxUid("movie:949", "abc123");
    expect(wcxUid("movie:949")).toBe("abc123");
    setWcxUid("movie:949", "other");
    setWcxUid("movie:949", null);
    expect(wcxUid("movie:949")).toBe("abc123");
  });

  it("keeps a miss for an hour, then asks again; a later hit replaces it", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
      setWcxUid("movie:1", null);
      vi.setSystemTime(new Date("2026-10-01T00:59:00Z"));
      expect(wcxUid("movie:1")).toBeNull();
      vi.setSystemTime(new Date("2026-10-01T01:01:00Z"));
      expect(wcxUid("movie:1")).toBeUndefined();
      setWcxUid("movie:1", "found");
      expect(wcxUid("movie:1")).toBe("found");
    } finally {
      vi.useRealTimers();
    }
  });

  it("finds a TMDB entry's IMDb id among the lookups", () => {
    saveImdbLookup("tt0113277", heat);
    saveImdbLookup("tt404", null);
    expect(imdbIdOfTmdb("movie", 949)).toBe("tt0113277");
    expect(imdbIdOfTmdb("tv", 949)).toBeNull();
    expect(imdbIdOfTmdb("movie", 1)).toBeNull();
  });
});

describe("releases below 720p", () => {
  // Heat has an XviD rip and a BluRay; Ronin only XviD and x264-SD rips.
  function seed() {
    addGroup("g1", "VECTOR");
    addGroup("g2", "FuN");
    insertReleases("g1", [
      release("1", {
        titleKey: "heat",
        imdbId: "tt0113277",
        name: "Heat.German.AC3.HDRip.XViD-VECTOR",
        quality: "XviD",
      }),
      release("2", { titleKey: "heat", imdbId: "tt0113277", name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR" }),
    ]);
    insertReleases("g2", [
      release("3", { titleKey: "ronin", imdbId: "tt0122690", name: "Ronin.German.DVDRip.XviD-FuN", quality: "XviD" }),
      release("4", {
        titleKey: "ronin",
        imdbId: "tt0122690",
        name: "Ronin.1998.German.BDRip.x264-FuN",
        quality: "x264-SD",
      }),
    ]);
  }

  it("stores them, but leaves them off the page, the panel and the filters", () => {
    seed();
    expect(releaseCounts()).toEqual({ groups: 2, releases: 4 });
    const { matched, items } = queryTitles(noFilters, "date", false, 0, 10);
    expect(matched).toBe(1);
    expect(items.map((t) => [t.key, t.releases, t.qualities])).toEqual([["heat", 1, ["HD-1080p"]]]);
    expect(tileCount()).toBe(1);
    expect(tileTitleKeys("ronin")).toEqual([]);
    expect(titleReleases("heat").map((r) => r.id)).toEqual(["2"]);
    expect(releaseFacets()).toEqual({ group: ["VECTOR"], quality: ["HD-1080p"] });
  });

  it("doesn't check titles on TMDB that have nothing else", () => {
    seed();
    expect(unlookedImdbIds().map((l) => l.imdbId)).toEqual(["tt0113277"]);
    expect(pendingTitles()).toMatchObject([
      { titleKey: "heat", names: ["Heat.1995.German.DL.1080p.BluRay.x264-VECTOR"] },
    ]);
  });

  it("leaves them out of which groups released a TMDB entry", () => {
    seed();
    saveTitleMatch("heat", "verified", heat, { title: "Heat", year: 1995 });
    insertReleases("g2", [release("5", { titleKey: "heat", name: "Heat.German.DVDRip.x265-FuN", quality: "x265-SD" })]);
    expect(groupsByTile(["movie:949"])).toEqual(new Map([["movie:949", ["VECTOR"]]]));
  });

  it("shows them, and checks their titles, once turned on", () => {
    seed();
    setPreferences({ showSdReleases: true });
    expect(queryTitles(noFilters, "date", false, 0, 10).items.map((t) => [t.key, t.releases])).toEqual([
      ["heat", 2],
      ["ronin", 2],
    ]);
    expect(releaseFacets().quality).toEqual(["HD-1080p", "XviD", "x264-SD"]);
    expect(pendingTitles().map((t) => t.titleKey)).toEqual(["heat", "ronin"]);
  });
});
