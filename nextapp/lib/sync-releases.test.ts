import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncReleases } from "./sync-releases";
import { addGroup, listGroups, queryTitles, releaseCounts } from "./store";
import { syncedAt } from "./store";
import { json, mockFetch } from "@/test/http";
import type { XrelP2pRelease } from "./xrel";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const p2p = (id: number, name: string, imdb?: string): XrelP2pRelease => ({
  id: "r" + id,
  dirname: name,
  link_href: "https://www.xrel.to/p2p/" + id,
  category: { meta_cat: "movie", sub_cat: "HD-1080p" },
  pub_time: 1000 + id,
  ext_info: { id: "e" + id, type: "movie", uris: imdb ? ["imdb:" + imdb] : [] },
});

// xREL pages per group (newest first), and TMDB answers per path.
function apis(
  pages: Record<string, XrelP2pRelease[][]>,
  tmdb: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) {
  return mockFetch((url) => {
    if (url.hostname === "api.xrel.to") {
      const group = pages[url.searchParams.get("group_id")!];
      if (!group) return new Response("", { status: 500 });
      const page = Number(url.searchParams.get("page"));
      return json(
        { total_count: 0, pagination: { current_page: page, per_page: 100, total_pages: group.length }, list: group[page - 1] ?? [] },
        { headers }
      );
    }
    if (url.hostname === "api.themoviedb.org") {
      const body = tmdb[url.pathname];
      return body === undefined ? new Response("", { status: 404 }) : json(body);
    }
  });
}

const run = (tmdbApiKey = "key") => syncReleases({ tmdbApiKey, language: "de-DE" });
const titles = () => queryTitles({ words: [], group: [], quality: [], type: [] }, "date", false, 0, 60).items;

describe("syncReleases", () => {
  it("walks a new group's whole list, then checks its titles on TMDB", async () => {
    addGroup("g1", "VECTOR");
    apis(
      { g1: [[p2p(3, "Heat.1995.German.DL.1080p-VECTOR", "tt1")], [p2p(2, "The.OutLaws.2023.German.DL.1080p-VECTOR", "tt2")]] },
      {
        "/3/find/tt1": { movie_results: [{ id: 949, title: "Heat", original_title: "Heat", release_date: "1995-12-15", poster_path: "/h.jpg" }] },
        // xREL's wrong link: a Romanian film from 1966.
        "/3/find/tt2": { movie_results: [{ id: 373995, title: "Amza", original_title: "Haiducii", release_date: "1966-01-01" }] },
        "/3/movie/373995": { alternative_titles: { titles: [] }, translations: { translations: [] } },
        "/3/search/movie": { results: [{ id: 921636, title: "The Out-Laws", original_title: "The Out-Laws", release_date: "2023-07-07", poster_path: "/o.jpg" }] },
      }
    );

    expect(await run()).toEqual({ groups: 1, added: 2 });

    expect(listGroups()[0]).toMatchObject({ count: 2, complete: true });
    expect(titles().map((t) => [t.title, t.tmdbId])).toEqual([
      ["Heat", 949],
      ["The Out-Laws", 921636],
    ]);
    expect(syncedAt("releases")).not.toBeNull();
  });

  it("stops a later sync at the first page it already has", async () => {
    addGroup("g1", "VECTOR");
    const first = [[p2p(2, "B.2020.German-VECTOR")], [p2p(1, "A.2020.German-VECTOR")]];
    apis({ g1: first });
    await run("");

    const fetch = apis({ g1: [[p2p(3, "C.2020.German-VECTOR"), p2p(2, "B.2020.German-VECTOR")], [p2p(1, "A.2020.German-VECTOR")]] });
    expect(await run("")).toEqual({ groups: 1, added: 1 });
    expect(fetch.mock.calls.filter(([u]) => String(u).includes("api.xrel.to"))).toHaveLength(1);
    expect(releaseCounts().releases).toBe(3);
  });

  it("stops when xREL's calls run out, keeping what it got", async () => {
    addGroup("g1", "VECTOR");
    const reset = String(Math.floor(Date.now() / 1000) + 600);
    apis({ g1: [[p2p(2, "B.2020.German-VECTOR")], [p2p(1, "A.2020.German-VECTOR")]] }, {}, {
      "x-ratelimit-remaining": "10",
      "x-ratelimit-reset": reset,
    });

    await expect(run("")).rejects.toThrow(/rate limit/);
    expect(releaseCounts().releases).toBe(1);
    expect(listGroups()[0].complete).toBe(false);
    expect(syncedAt("releases")).toBeNull();
  });

  it("syncs the other groups when one fails, then reports the failure", async () => {
    addGroup("broken", "BROKEN");
    addGroup("g1", "VECTOR");
    apis({ g1: [[p2p(1, "A.2020.German-VECTOR")]] });

    await expect(run("")).rejects.toThrow(/HTTP 500/);
    expect(releaseCounts().releases).toBe(1);
    expect(syncedAt("releases")).toBeNull();
  });

  it("without a TMDB key, shows release names' titles and asks TMDB nothing", async () => {
    addGroup("g1", "VECTOR");
    const fetch = apis({ g1: [[p2p(1, "Heat.1995.German.DL.1080p-VECTOR", "tt1")]] });
    await run("");
    expect(titles()[0]).toMatchObject({ title: "Heat", year: 1995, tmdbId: null });
    expect(fetch.mock.calls.some(([u]) => String(u).includes("themoviedb"))).toBe(false);
  });
});
