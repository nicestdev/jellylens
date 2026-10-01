import { describe, expect, it } from "vitest";
import type { ReleasesResponse } from "@/lib/api-types";
import {
  facetValues,
  noFilters,
  qualityBadges,
  releasesUrl,
  subtitle,
} from "./logic";

describe("releasesUrl", () => {
  it("sends the trimmed search, the sort, the page and every selected value", () => {
    const filters = { ...noFilters(), group: new Set(["VECTOR", "FuN"]), quality: new Set(["HD-1080p"]) };
    const url = new URL(releasesUrl(" dune ", filters, "title", "asc", 60), "http://jellylens.test");
    expect(url.pathname).toBe("/api/releases");
    expect(url.searchParams.get("q")).toBe("dune");
    expect(url.searchParams.get("sort")).toBe("title");
    expect(url.searchParams.get("dir")).toBe("asc");
    expect(url.searchParams.get("offset")).toBe("60");
    expect(url.searchParams.getAll("group")).toEqual(["VECTOR", "FuN"]);
    expect(url.searchParams.getAll("quality")).toEqual(["HD-1080p"]);
  });
});

describe("facetValues", () => {
  it("lists qualities best first, then A→Z; other facets as the server does", () => {
    const qualities = ["HD-720p", "XviD", "HD-2160p", "DVDR", "HD-1080p"];
    expect(facetValues("quality", qualities, new Set())).toEqual(["HD-2160p", "HD-1080p", "HD-720p", "DVDR", "XviD"]);
    expect(facetValues("group", ["VECTOR", "FuN"], new Set())).toEqual(["VECTOR", "FuN"]);
  });

  it("hides a facet with a single value unless it's in use", () => {
    expect(facetValues("type", ["movie"], new Set())).toEqual([]);
    expect(facetValues("type", ["movie"], new Set(["movie"]))).toEqual(["movie"]);
  });
});

describe("qualityBadges", () => {
  it("badges the HD resolutions a title comes in, 4K last", () => {
    expect(qualityBadges(["HD-2160p", "SD", "HD-1080p"])).toEqual([{ label: "1080p" }, { label: "4K", tone: "accent" }]);
    expect(qualityBadges(["DVDR"])).toEqual([]);
  });

});

describe("subtitle", () => {
  const data = (over: Partial<ReleasesResponse>): ReleasesResponse => ({
    total: 11337,
    matched: 42,
    Items: [],
    facets: { group: [], quality: [], type: [] },
    groups: 3,
    syncing: false,
    ...over,
  });

  it("explains an empty setup, counts titles, and how many match a search", () => {
    expect(subtitle(null, false)).toBe("Loading…");
    expect(subtitle(data({ groups: 0 }), false)).toBe("P2P releases of your favorite groups, from xREL.");
    expect(subtitle(data({}), false)).toBe("11.337 titles from 3 groups");
    expect(subtitle(data({ groups: 1 }), false)).toBe("11.337 titles from 1 group");
    expect(subtitle(data({}), true)).toBe("42 of 11.337 titles");
  });
});
