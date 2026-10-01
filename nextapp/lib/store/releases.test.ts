import { describe, expect, it } from "vitest";
import {
  addGroup,
  groupsByTile,
  hasGroupNamed,
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
  setVerdict,
  tileCount,
  tileOf,
  tileTitleKeys,
  releaseFacets,
  titleReleases,
  unlookedImdbIds,
  type TitleFilters,
  type TmdbEntry,
} from "./releases";
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

const heat: TmdbEntry = { mediaType: "movie", tmdbId: 949, title: "Heat", originalTitle: "Heat", year: 1995, posterPath: "/heat.jpg" };
const noFilters: TitleFilters = { words: [], group: [], quality: [], type: [] };

describe("groups", () => {
  it("lists groups in the order they were added, with their release counts", () => {
    addGroup("g2", "VECTOR");
    addGroup("g1", "FuN");
    addGroup("g2", "VECTOR");
    insertReleases("g1", [release("1"), release("2")]);
    markGroupSynced("g1", "2026-06-15T00:00:00Z");
    expect(listGroups()).toEqual([
      { id: "g2", name: "VECTOR", count: 0, syncedAt: null, complete: false },
      { id: "g1", name: "FuN", count: 2, syncedAt: "2026-06-15T00:00:00Z", complete: true },
    ]);
    expect(hasGroupNamed("vector")).toBe(true);
    expect(releaseCounts()).toEqual({ groups: 2, releases: 2 });
  });

  it("takes a group's releases along when it's removed", () => {
    addGroup("g1", "FuN");
    insertReleases("g1", [release("1")]);
    removeGroup("g1");
    expect(releaseCounts()).toEqual({ groups: 0, releases: 0 });
  });
});

describe("insertReleases", () => {
  it("tells when a page reaches releases it already has", () => {
    addGroup("g1", "FuN");
    expect(insertReleases("g1", [release("1"), release("2")])).toEqual({ added: 2, known: false });
    expect(insertReleases("g1", [release("3"), release("2")])).toEqual({ added: 1, known: true });
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
      release("2", { name: "Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR", titleKey: "heat", quality: "HD-2160p", publishedAt: 100 }),
      release("3", { name: "Ein.Muenchner.im.Himmel.2026.German.1080p-VECTOR", titleKey: "himmel", imdbId: "tt3", publishedAt: 200 }),
    ]);
    insertReleases("g2", [release("4", { name: "Silo.2023.S01E01.German.DL.1080p-FuN", titleKey: "silo", type: "tv", publishedAt: 50 })]);
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
    saveTitleMatch("silo", "verified", { ...heat, tmdbId: 1, mediaType: "tv", title: "Silo – Die Zuflucht", originalTitle: "Silo" }, { title: "Silo", year: 2023 });
    expect(query({ words: ["zuflucht"] }).items.map((t) => t.key)).toEqual(["tv:1"]);
  });

  it("takes LIKE wildcards literally", () => {
    seed();
    expect(query({ words: ["%"] }).matched).toBe(0);
    expect(query({ words: ["_"] }).matched).toBe(0);
  });

  it("filters by group, quality and type; values of one kind are alternatives", () => {
    seed();
    expect(query({ group: ["FuN"] }).items.map((t) => t.key)).toEqual(["silo"]);
    expect(query({ quality: ["HD-2160p"] }).items.map((t) => t.key)).toEqual(["movie:949"]);
    expect(query({ quality: ["HD-2160p"] }).items[0].qualities).toEqual(["HD-2160p"]);
    expect(query({ type: ["tv", "movie"] }).matched).toBe(3);
    expect(query({ group: ["VECTOR"], type: ["tv"] }).matched).toBe(0);
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
  it("lists the filter values, groups in the order they were added; counts the tiles", () => {
    addGroup("g2", "VECTOR");
    addGroup("g1", "FuN");
    addGroup("g3", "Empty");
    insertReleases("g1", [release("1", { titleKey: "a", quality: "HD-2160p" }), release("2", { titleKey: "a", type: "tv" })]);
    insertReleases("g2", [release("3", { titleKey: "b" })]);
    expect(releaseFacets()).toEqual({ group: ["VECTOR", "FuN"], quality: ["HD-1080p", "HD-2160p"], type: ["movie", "tv"] });
    expect(tileCount()).toBe(2);
    removeGroup("g1");
    expect(releaseFacets()).toEqual({ group: ["VECTOR"], quality: ["HD-1080p"], type: ["movie"] });
    expect(tileCount()).toBe(1);
  });
});

describe("tiles", () => {
  // xREL lists Heat twice: an old SD rip and the later BluRays.
  function seed() {
    addGroup("g1", "VECTOR");
    insertReleases("g1", [
      release("1", { titleKey: "heat-sd", name: "Heat.German.AC3.HDRip.XViD-VECTOR", quality: "SD", publishedAt: 100 }),
      release("2", { titleKey: "heat", name: "Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR", quality: "HD-2160p", publishedAt: 300 }),
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
      ["movie:949", 2, ["HD-2160p", "SD"]],
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

  it("tells which groups released a TMDB entry, A→Z", () => {
    seed();
    addGroup("g0", "FuN");
    insertReleases("g0", [release("4", { titleKey: "heat-web", name: "Heat.1995.1080p.WEB.H264-FuN" })]);
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
    expect(matchInfo("heat")).toMatchObject({ status: "unverified", shown: { tmdbId: null }, candidate: { title: "Heat", year: 1995 } });
  });

  it("lists a title's releases, newest first", () => {
    addGroup("g1", "VECTOR");
    insertReleases("g1", [release("1", { titleKey: "x", publishedAt: 1 }), release("2", { titleKey: "x", publishedAt: 2 })]);
    expect(titleReleases("x").map((r) => [r.id, r.group])).toEqual([
      ["2", "VECTOR"],
      ["1", "VECTOR"],
    ]);
  });
});
