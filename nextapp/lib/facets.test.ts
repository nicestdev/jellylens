import { describe, expect, it } from "vitest";
import { byCount, compareValues, countValues, libraryView, matchesAny, rankIn, sortedBy, toggled } from "./facets";

describe("toggled", () => {
  it("adds or removes the value without touching the original", () => {
    const set = new Set(["a"]);
    expect([...toggled(set, "b")]).toEqual(["a", "b"]);
    expect([...toggled(set, "a")]).toEqual([]);
    expect([...set]).toEqual(["a"]);
  });
});

describe("countValues and byCount", () => {
  it("count items per value and list the most common first, ties A→Z", () => {
    const counts = countValues([["Drama", "Comedy"], ["Drama"], ["Action"]], (g) => g);
    expect(Object.fromEntries(counts)).toEqual({ Drama: 2, Comedy: 1, Action: 1 });
    expect(byCount(counts)).toEqual(["Drama", "Action", "Comedy"]);
  });
});

describe("matchesAny", () => {
  it("passes everything while nothing is selected, else needs one selected value", () => {
    expect(matchesAny(new Set(), [])).toBe(true);
    expect(matchesAny(new Set(["de"]), ["en", "de"])).toBe(true);
    expect(matchesAny(new Set(["de"]), ["en"])).toBe(false);
  });
});

describe("sortedBy", () => {
  it("sorts strings by locale and numbers numerically, either way", () => {
    expect(compareValues("a", "b")).toBeLessThan(0);
    expect(compareValues(10, 9)).toBeGreaterThan(0);
    const items = [{ n: 2 }, { n: 10 }, { n: 1 }];
    expect(sortedBy(items, (i) => i.n, "asc").map((i) => i.n)).toEqual([1, 2, 10]);
    expect(sortedBy(items, (i) => i.n, "desc").map((i) => i.n)).toEqual([10, 2, 1]);
    expect(items.map((i) => i.n)).toEqual([2, 10, 1]);
  });
});

describe("libraryView", () => {
  const items = [
    { Name: "Ein Münchner im Himmel", Genres: ["Comedy"], langs: ["de"] },
    { Name: "Heat", Genres: ["Crime", "Drama"], langs: ["en", "de"] },
    { Name: "Alien", Genres: ["Horror"], langs: ["en"] },
  ];
  const view = (query: string, genres: string[] = [], langs: string[] = []) =>
    libraryView(
      items,
      { query, genres: new Set(genres), langs: new Set(langs) },
      (i) => i.langs,
      (i) => i.Name,
      "asc",
    );

  it("searches every word, umlauts either way, and sorts", () => {
    expect(view("muenchner himmel").rows.map((i) => i.Name)).toEqual(["Ein Münchner im Himmel"]);
    expect(view("").rows.map((i) => i.Name)).toEqual(["Alien", "Ein Münchner im Himmel", "Heat"]);
    expect(view("").narrowed).toBe(false);
    expect(view(" heat ").narrowed).toBe(true);
  });

  it("filters by any picked genre and language, counting over the whole library", () => {
    const v = view("", ["Crime", "Horror"], ["de"]);
    expect(v.rows.map((i) => i.Name)).toEqual(["Heat"]);
    expect(v.narrowed).toBe(true);
    expect(v.langCounts).toEqual(
      new Map([
        ["de", 2],
        ["en", 2],
      ]),
    );
    expect(v.genreCounts.get("Drama")).toBe(1);
  });
});

describe("rankIn", () => {
  it("ranks by the list's order, anything else last", () => {
    const rank = rankIn(["2160p", "1080p"]);
    expect(["SD", "1080p", "2160p"].sort((a, b) => rank(a) - rank(b))).toEqual(["2160p", "1080p", "SD"]);
    expect(rank("x")).toBe(2);
  });
});
