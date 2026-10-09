import { beforeEach, describe, expect, it, vi } from "vitest";
import { releaseSync, syncReleases } from "./sync-releases";
import { resetServerState } from "@/test/state";
import { addGroup, listGroups, queryTitles, releaseCounts, removeGroup, titleReleases } from "./store";
import { syncedAt } from "./store";
import { json, mockFetch } from "@/test/http";
import type { XrelP2pRelease, XrelSceneRelease } from "./xrel";

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

const scene = (id: number, name: string, group: string): XrelSceneRelease => ({
  id: "s" + id,
  dirname: name,
  link_href: "https://www.xrel.to/release/" + id,
  time: 2000 + id,
  group_name: group,
  size: { number: 1.5, unit: "GB" },
  ext_info: { id: "e" + id, type: "tv" },
});

// xREL pages per P2P group (newest first), search hits per scene group,
// and TMDB answers per path.
function apis(
  pages: Record<string, XrelP2pRelease[][]>,
  tmdb: Record<string, unknown> = {},
  headers: Record<string, string> = {},
  searches: Record<string, XrelSceneRelease[] | (() => XrelSceneRelease[])> = {},
) {
  return mockFetch((url) => {
    if (url.hostname === "api.xrel.to" && url.pathname === "/v2/search/releases.json") {
      const hits = searches[url.searchParams.get("q")!];
      if (!hits) return new Response("", { status: 500 });
      return json({ results: typeof hits === "function" ? hits() : hits });
    }
    if (url.hostname === "api.xrel.to") {
      const group = pages[url.searchParams.get("group_id")!];
      if (!group) return new Response("", { status: 500 });
      const page = Number(url.searchParams.get("page"));
      return json(
        {
          total_count: 0,
          pagination: { current_page: page, per_page: 100, total_pages: group.length },
          list: group[page - 1] ?? [],
        },
        { headers },
      );
    }
    if (url.hostname === "api.themoviedb.org") {
      const body = tmdb[url.pathname];
      return body === undefined ? new Response("", { status: 404 }) : json(body);
    }
  });
}

const run = (tmdbApiKey = "key") => syncReleases({ tmdbApiKey, language: "de-DE" });
const titles = () => queryTitles({ words: [], group: [], quality: [] }, "date", false, 0, 60).items;

describe("syncReleases", () => {
  it("walks a new group's whole list, then checks its titles on TMDB", async () => {
    addGroup("g1", "VECTOR");
    apis(
      {
        g1: [
          [p2p(3, "Heat.1995.German.DL.1080p-VECTOR", "tt1")],
          [p2p(2, "The.OutLaws.2023.German.DL.1080p-VECTOR", "tt2")],
        ],
      },
      {
        "/3/find/tt1": {
          movie_results: [
            { id: 949, title: "Heat", original_title: "Heat", release_date: "1995-12-15", poster_path: "/h.jpg" },
          ],
        },
        // xREL's wrong link: a Romanian film from 1966.
        "/3/find/tt2": {
          movie_results: [{ id: 373995, title: "Amza", original_title: "Haiducii", release_date: "1966-01-01" }],
        },
        "/3/movie/373995": { alternative_titles: { titles: [] }, translations: { translations: [] } },
        "/3/search/movie": {
          results: [
            {
              id: 921636,
              title: "The Out-Laws",
              original_title: "The Out-Laws",
              release_date: "2023-07-07",
              poster_path: "/o.jpg",
            },
          ],
        },
      },
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

    const fetch = apis({
      g1: [[p2p(3, "C.2020.German-VECTOR"), p2p(2, "B.2020.German-VECTOR")], [p2p(1, "A.2020.German-VECTOR")]],
    });
    expect(await run("")).toEqual({ groups: 1, added: 1 });
    expect(fetch.mock.calls.filter(([u]) => String(u).includes("api.xrel.to"))).toHaveLength(1);
    expect(releaseCounts().releases).toBe(3);
  });

  it("stops when xREL's calls run out, keeping what it got", async () => {
    addGroup("g1", "VECTOR");
    const reset = String(Math.floor(Date.now() / 1000) + 600);
    apis(
      { g1: [[p2p(2, "B.2020.German-VECTOR")], [p2p(1, "A.2020.German-VECTOR")]] },
      {},
      {
        "x-ratelimit-remaining": "10",
        "x-ratelimit-reset": reset,
      },
    );

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

  it("picks up a group added while the titles are checked", async () => {
    addGroup("g1", "VECTOR");
    let added = false;
    mockFetch((url) => {
      if (url.hostname === "api.xrel.to") {
        const group = url.searchParams.get("group_id")!;
        const list = [p2p(group === "g1" ? 1 : 2, `Heat.1995.German-${group}`, "tt1")];
        return json({ total_count: 0, pagination: { current_page: 1, per_page: 100, total_pages: 1 }, list });
      }
      // VECTOR's titles are being checked: FuN is added now.
      if (!added) addGroup("g2", "FuN");
      added = true;
      return new Response("", { status: 404 });
    });

    expect(await run()).toEqual({ groups: 2, added: 2 });
    expect(listGroups().map((g) => [g.name, g.count, g.complete])).toEqual([
      ["VECTOR", 1, true],
      ["FuN", 1, true],
    ]);
  });

  it("without a TMDB key, shows release names' titles and asks TMDB nothing", async () => {
    addGroup("g1", "VECTOR");
    const fetch = apis({ g1: [[p2p(1, "Heat.1995.German.DL.1080p-VECTOR", "tt1")]] });
    await run("");
    expect(titles()[0]).toMatchObject({ title: "Heat", year: 1995, tmdbId: null });
    expect(fetch.mock.calls.some(([u]) => String(u).includes("themoviedb"))).toBe(false);
  });
});

describe("syncReleases with scene groups", () => {
  // Searches are spaced 2.5 s apart; skip the waits.
  async function runWithoutWaits(tmdbApiKey = "") {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const result = run(tmdbApiKey);
      result.catch(() => {});
      await vi.advanceTimersByTimeAsync(10_000);
      return await result;
    } finally {
      vi.useRealTimers();
    }
  }

  it("adds a scene group's search hits next to the P2P lists, with quality and size", async () => {
    addGroup("g1", "VECTOR");
    addGroup("scene:WAYNE", "WAYNE", "scene");
    apis(
      { g1: [[p2p(1, "Heat.1995.German.DL.1080p-VECTOR")]] },
      {},
      {},
      {
        WAYNE: [
          scene(1, "Silo.S01E01.GERMAN.DL.1080P.WEB.H264-WAYNE", "WAYNE"),
          // The search also finds other groups' releases with the name in them.
          scene(2, "Bruce.Wayne.S01E01.GERMAN.720p.WEB.H264-OTHER", "OTHER"),
        ],
      },
    );

    expect(await runWithoutWaits()).toEqual({ groups: 2, added: 2 });
    expect(listGroups().map((g) => [g.name, g.count, g.complete])).toEqual([
      ["VECTOR", 1, true],
      ["WAYNE", 1, true],
    ]);
    expect(titleReleases("e1")).toMatchObject([{ group: "WAYNE", quality: "HD-1080p" }]);
    expect(titles().map((t) => [t.title, t.groups])).toEqual([
      ["Silo", ["WAYNE"]],
      ["Heat", ["VECTOR"]],
    ]);
  });

  it("keeps what earlier syncs found as the search moves on", async () => {
    addGroup("scene:WAYNE", "WAYNE", "scene");
    apis({}, {}, {}, { WAYNE: [scene(1, "A.S01E01.GERMAN.1080P.WEB.H264-WAYNE", "WAYNE")] });
    await runWithoutWaits();
    apis({}, {}, {}, { WAYNE: [scene(2, "A.S01E02.GERMAN.1080P.WEB.H264-WAYNE", "WAYNE")] });
    expect(await runWithoutWaits()).toEqual({ groups: 1, added: 1 });
    expect(releaseCounts().releases).toBe(2);
  });

  it("stores nothing for a scene group removed while its search ran", async () => {
    addGroup("scene:WAYNE", "WAYNE", "scene");
    apis(
      {},
      {},
      {},
      {
        WAYNE: () => {
          removeGroup("scene:WAYNE");
          return [scene(1, "A.S01E01.GERMAN.1080P.WEB.H264-WAYNE", "WAYNE")];
        },
      },
    );
    await runWithoutWaits();
    expect(releaseCounts()).toEqual({ groups: 0, releases: 0 });
  });

  it("syncs the other groups when a scene search fails, then reports the failure", async () => {
    addGroup("scene:BROKEN", "BROKEN", "scene");
    addGroup("g1", "VECTOR");
    apis({ g1: [[p2p(1, "A.2020.German-VECTOR")]] });
    await expect(runWithoutWaits()).rejects.toThrow(/HTTP 500/);
    expect(listGroups().map((g) => [g.name, g.complete])).toEqual([
      ["BROKEN", false],
      ["VECTOR", true],
    ]);
    expect(syncedAt("releases")).toBeNull();
  });
});

describe("releaseSync", () => {
  it("starts over with the server state, so no test sees another's sync", () => {
    releaseSync().groupId = "g1";
    releaseSync().matching = true;
    resetServerState();
    expect(releaseSync()).toEqual({ groupId: null, matching: false });
  });
});
