import { describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import { addGroup, insertReleases, releaseFacets, setSyncedAt, syncedAt, titleReleases, wcxUid } from "./store";
import type { WcxEntry } from "./wcx";

vi.mock("./env", async (original) => ({
  ...(await original<typeof import("./env")>()),
  WCX_API_URL: "https://api.wcx.test",
  WCX_URL: "https://wcx.test",
}));
// No pauses between pages.
vi.mock("./async", async (original) => ({ ...(await original<typeof import("./async")>()), sleep: async () => {} }));

const { syncWcx } = await import("./sync-wcx");

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
const entry = (uid: string, updated: string, names: string[], tmdbId?: number): WcxEntry => ({
  uid,
  type: "movie",
  updated_at: updated,
  options: { tmdb_id: tmdbId ?? null },
  releases: names.map((fulltitle, i) => ({ id: uid.charCodeAt(0) * 100 + i, fulltitle })),
});

// WCX's latest movies, page by page (and shows, none unless given).
function latest(pages: WcxEntry[][], shows: WcxEntry[][] = [[]]) {
  return mockFetch((url) => {
    if (url.hostname !== "api.wcx.test" || url.pathname !== "/start/search") return undefined;
    const list = url.searchParams.get("types") === "series" ? shows : pages;
    const page = Number(url.searchParams.get("page"));
    return json({ items: { data: list[page - 1] ?? [], last_page: list.length } });
  });
}
const run = () => syncWcx({ tmdbApiKey: "", language: "de-DE" });

describe("syncWcx", () => {
  it("goes a week back the first time, keeping each release's group and the entry's uid", async () => {
    const fetch = latest([
      [entry("a", hoursAgo(1), ["Heat.1995.German.DL.1080p.BluRay.x264-FuN"], 949)],
      [entry("b", hoursAgo(24 * 6), ["Alien.1979.German.DL.2160p.UHD.BluRay.x265-SpiCy"])],
      [entry("c", hoursAgo(24 * 8), ["Old.2000.German.720p.WEB.x264-OLD"])],
      [entry("d", hoursAgo(24 * 9), ["Older.2000.German.720p.WEB.x264-OLD"])],
    ]);

    expect(await run()).toMatchObject({ pages: 4, added: 2 });
    expect(fetch).toHaveBeenCalledTimes(4);
    // As the site's own pages ask, from WCX_URL.
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ Origin: "https://wcx.test", Referer: "https://wcx.test/" });
    expect(String(fetch.mock.calls[0][0])).toContain("per_page=21&page=1&types=movie&sortOrder=latest&sortBy=desc");
    expect(titleReleases("wcx:a~1995")).toMatchObject([{ group: "FuN", link: "https://wcx.test/detail/a" }]);
    expect(titleReleases("wcx:b~1979")).toMatchObject([{ group: "SpiCy" }]);
    expect(titleReleases("wcx:c~2000")).toEqual([]);
    expect(wcxUid("movie:949")).toBe("a");
    expect(syncedAt("wcx")).not.toBeNull();
  });

  it("stops at what changed before the last sync", async () => {
    setSyncedAt("wcx", hoursAgo(6));
    const fetch = latest(
      [
        [entry("a", hoursAgo(1), ["New.2026.German.1080p.WEB.x264-FuN"]), entry("b", hoursAgo(7), ["B.2026-X"])],
        [entry("c", hoursAgo(8), ["C.2026-X"])],
      ],
      [
        [
          { ...entry("s", hoursAgo(2), ["Show.S01E01.German.1080p.WEB.x264-TVS"]), type: "series" },
          entry("t", hoursAgo(9), ["T-X"]),
        ],
      ],
    );

    expect(await run()).toMatchObject({ pages: 2, added: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(titleReleases("wcx:s")).toMatchObject([{ group: "TVS" }]);
  });
});

describe("releaseFacets", () => {
  it("lists the favorite groups first, then WCX's others, each A→Z", () => {
    addGroup("g1", "VECTOR");
    insertReleases("g1", [
      {
        id: "x1",
        name: "A.2020.1080p-VECTOR",
        link: "",
        type: "movie",
        quality: "HD-1080p",
        publishedAt: 1,
        titleKey: "e1",
      },
    ]);
    insertReleases(null, [
      {
        id: "wcx:1",
        name: "B.2020.1080p-zzz",
        link: "",
        type: "movie",
        quality: "HD-1080p",
        publishedAt: 1,
        titleKey: "wcx:b",
        group: "zzz",
      },
      {
        id: "wcx:2",
        name: "C.2020.1080p-AAA",
        link: "",
        type: "movie",
        quality: "HD-1080p",
        publishedAt: 1,
        titleKey: "wcx:c",
        group: "AAA",
      },
      {
        id: "wcx:3",
        name: "D.2020.1080p-vector",
        link: "",
        type: "movie",
        quality: "HD-1080p",
        publishedAt: 1,
        titleKey: "wcx:d",
        group: "VECTOR",
      },
    ]);
    expect(releaseFacets()).toMatchObject({ group: ["VECTOR", "AAA", "zzz"], favorites: 1 });
  });
});
