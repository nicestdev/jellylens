import { describe, expect, it } from "vitest";
import type { MatchInfo, ReleasesResponse } from "@/lib/api-types";
import {
  facetValues,
  matchActions,
  matchNote,
  noFilters,
  qualityBadges,
  releasesUrl,
  subtitle,
  titleMeta,
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

describe("tile texts", () => {
  it("badges the HD resolutions a title comes in, 4K last", () => {
    expect(qualityBadges(["HD-2160p", "SD", "HD-1080p"])).toEqual([{ label: "1080p" }, { label: "4K", tone: "accent" }]);
    expect(qualityBadges(["DVDR"])).toEqual([]);
  });

  it("shows the year and the number of releases", () => {
    expect(titleMeta({ year: 2021, releases: 3 })).toBe("2021 · 3 releases");
    expect(titleMeta({ year: null, releases: 1 })).toBe("1 release");
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

describe("matchActions and matchNote", () => {
  const match = (over: Partial<MatchInfo>): MatchInfo => ({ status: "verified", shown: null, verdict: null, candidate: null, ...over });
  const verdicts = (m: MatchInfo) => matchActions(m).map((a) => a.verdict);

  it("offers to reject an automatic match", () => {
    expect(verdicts(match({}))).toEqual(["wrong"]);
    expect(verdicts(match({ status: "searched" }))).toEqual(["wrong"]);
    expect(matchNote(match({}))).toBeNull();
  });

  it("offers xREL's candidate when it wasn't taken", () => {
    const candidate = { title: "Dune", year: 2021 };
    expect(matchActions(match({ status: "unverified", candidate }))).toEqual([
      { label: "Use xREL's match: Dune (2021)", verdict: "xrel" },
    ]);
    expect(verdicts(match({ status: "unverified" }))).toEqual([]);
    expect(matchNote(match({ status: "unverified" }))).toBe("Not matched: TMDB doesn't know this title.");
  });

  it("offers to undo a decision by hand", () => {
    expect(verdicts(match({ status: "confirmed", verdict: "xrel" }))).toEqual([null]);
    expect(verdicts(match({ status: "rejected", verdict: "wrong", candidate: { title: "Dune", year: null } }))).toEqual(["xrel", null]);
    expect(matchNote(match({ status: "rejected", verdict: "wrong" }))).toBe("Marked as a wrong match by you.");
  });
});
