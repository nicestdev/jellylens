import { describe, expect, it } from "vitest";
import { byCount, compareValues, countValues, matchesAny, sortedBy, toggled } from "./facets";

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
