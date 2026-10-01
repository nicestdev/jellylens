import { describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import * as xrel from "./xrel";

const limitHeaders = (remaining: number, resetIn = 1800) => ({
  "x-ratelimit-remaining": String(remaining),
  "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + resetIn),
});

const p2p = (over: Partial<xrel.XrelP2pRelease> = {}): xrel.XrelP2pRelease => ({
  id: "r1",
  dirname: "Heat.1995.German.DL.1080p.BluRay.x265-VECTOR",
  link_href: "https://www.xrel.to/p2p/1-Heat/nfo.html",
  category: { meta_cat: "movie", sub_cat: "HD-1080p" },
  pub_time: 1790000000,
  size_mb: 11800,
  group: { id: "g1", name: "VECTOR" },
  ext_info: { id: "e1", type: "movie", uris: ["imdb:tt0113277"] },
  ...over,
});

describe("toRelease", () => {
  it("keeps what the Releases page uses", () => {
    expect(xrel.toRelease(p2p())).toEqual({
      id: "r1",
      name: "Heat.1995.German.DL.1080p.BluRay.x265-VECTOR",
      link: "https://www.xrel.to/p2p/1-Heat/nfo.html",
      type: "movie",
      quality: "HD-1080p",
      publishedAt: 1790000000,
      sizeMb: 11800,
      titleKey: "e1~1995",
      imdbId: "tt0113277",
    });
  });

  it("splits a movie's releases by the year in their names, not a show's", () => {
    expect(xrel.toRelease(p2p({ dirname: "Heat.German.AC3.HDRip.XViD-VECTOR" })).titleKey).toBe("e1");
    const show = p2p({ dirname: "The.Boys.2019.S04E08.German.DL.2160p.WEB.H265-ZeroTwo", ext_info: { id: "e2", type: "tv" } });
    expect(xrel.toRelease(show).titleKey).toBe("e2");
  });

  it("has no size when xREL gives none", () => {
    expect(xrel.toRelease(p2p({ size_mb: undefined })).sizeMb).toBeUndefined();
    expect(xrel.toRelease(p2p({ size_mb: 0 })).sizeMb).toBeUndefined();
  });

  it("lets a release without a title stand alone", () => {
    const r = xrel.toRelease(p2p({ ext_info: undefined }));
    expect(r).toMatchObject({ titleKey: "release:r1", imdbId: undefined, type: "movie" });
  });
});

describe("fetchGroupReleases", () => {
  it("asks for a page of 100 and maps it", async () => {
    const fetch = mockFetch(() =>
      json({ total_count: 1, pagination: { current_page: 2, per_page: 100, total_pages: 3 }, list: [p2p()] })
    );
    const page = await xrel.fetchGroupReleases("g1", 2);
    expect(page.totalPages).toBe(3);
    expect(page.releases.map((r) => r.id)).toEqual(["r1"]);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/v2/p2p/releases.json");
    expect(Object.fromEntries(url.searchParams)).toEqual({ group_id: "g1", per_page: "100", page: "2" });
  });

  it("stops before using up the last calls of the hour", async () => {
    const fetch = mockFetch(() =>
      json({ total_count: 0, pagination: { current_page: 1, per_page: 100, total_pages: 1 }, list: [] }, { headers: limitHeaders(10) })
    );
    await xrel.fetchGroupReleases("g1", 1);
    await expect(xrel.fetchGroupReleases("g1", 2)).rejects.toThrow(/rate limit reached, try again in 30 minutes/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("carries on once the hour has passed", async () => {
    mockFetch(() =>
      json({ total_count: 0, pagination: { current_page: 1, per_page: 100, total_pages: 1 }, list: [] }, { headers: limitHeaders(0, -1) })
    );
    await xrel.fetchGroupReleases("g1", 1);
    await expect(xrel.fetchGroupReleases("g1", 2)).resolves.toBeDefined();
  });

  it("turns a 429 into a rate limit error", async () => {
    mockFetch(() => new Response("", { status: 429, headers: limitHeaders(0) }));
    await expect(xrel.fetchGroupReleases("g1", 1)).rejects.toBeInstanceOf(xrel.RateLimitError);
  });

  it("reports xREL's own error message", async () => {
    mockFetch(() => json({ error_description: "An argument is invalid or missing." }, { status: 400 }));
    await expect(xrel.fetchGroupReleases("g1", 1)).rejects.toThrow("An argument is invalid or missing.");
  });
});

describe("findGroup", () => {
  it("finds a group by the tag at the end of its release names", async () => {
    const fetch = mockFetch(() =>
      json({ p2p_results: [p2p({ group: { id: "other", name: "GOG" } }), p2p({ group: { id: "g1", name: "VECTOR" } })] })
    );
    expect(await xrel.findGroup("vector")).toEqual({ id: "g1", name: "VECTOR" });
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.searchParams.get("q")).toBe("-vector");
    expect(url.searchParams.get("p2p")).toBe("1");
  });

  it("returns null when no release carries exactly that name", async () => {
    mockFetch(() => json({ p2p_results: [p2p({ group: { id: "g2", name: "VECTOR2" } })] }));
    expect(await xrel.findGroup("VECTOR")).toBeNull();
  });
});

describe("isSceneGroup", () => {
  it("tells a scene group apart from a typo", async () => {
    mockFetch((url) => json({ results: url.searchParams.get("q") === "WAYNE" ? [{ group_name: "WAYNE" }] : [] }));
    expect(await xrel.isSceneGroup("WAYNE")).toBe(true);
  });

  it("spaces searches 2.5 s apart", async () => {
    vi.useFakeTimers();
    try {
      const fetch = mockFetch(() => json({ results: [] }));
      const first = xrel.isSceneGroup("A");
      const second = xrel.isSceneGroup("B");
      await first;
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2500);
      await second;
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
