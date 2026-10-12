import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import { db } from "@/lib/db";
import { listFiles, listPackages, setWcxUid } from "@/lib/store";

// GET and POST /api/wcx-releases, with a ddownload account set up (and no
// Real-Debrid), so ddownload mirrors can be fetched and others can't.
vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  DDOWNLOAD_LOGIN: "login",
  DDOWNLOAD_PASSWORD: "password",
}));
// The queue itself isn't run: only whether a package was handed to it.
const queue = vi.hoisted(() => ({ kickDownloads: vi.fn() }));
vi.mock("@/lib/downloader", async (original) => ({
  ...(await original<typeof import("@/lib/downloader")>()),
  ...queue,
}));
beforeEach(() => queue.kickDownloads.mockClear());

// A movie file the library has (a row of media_files, what libraryOf reads).
function owned(tmdbId: number) {
  db()
    .prepare(
      `INSERT INTO media_files (kind, item_id, idx, parent_id, title, tmdb_id, file_name, path, size, grp,
         resolution, codec, languages, search)
       VALUES ('movie', 'm1', 0, 'p', 'Heat', ?, 'Heat.mkv', 'nvme01/movies/Heat/Heat.mkv', 1, 'OLD', '1080p', 'x264',
         '[]', 'heat')`,
    )
    .run(String(tmdbId));
}

const route = () => import("./wcx-releases/route");
const get = async (tmdbId: string) =>
  (await route()).GET(new Request("http://jellylens.test/api/wcx-releases?tmdbId=" + tmdbId));
const post = async (body: unknown) =>
  (await route()).POST(
    new Request("http://jellylens.test/api/wcx-releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

// Heat's WCX page: an older 2160p release whose ddownload links are gone
// (re-uploaded, its filecrypt container has the new ones), and a newer
// 1080p one (its container no hide.cx id: left out).
const detail = {
  item: {
    releases: [
      {
        uid: "uhd",
        fulltitle: "Heat.1995.German.DL.2160p.WebHD.h265-iNNOVATiV",
        size: 0,
        created_at: "2023-12-30T06:12:21.000000Z",
        links: { "ddownload.com": ["https://ddownload.com/deaddeaddead/Heat.part01.rar"] },
        crypted_links: { "ddownload.com": "https://filecrypt.cc/Container/0000000001.html" },
      },
      {
        uid: "remux",
        group: "pmHD",
        fulltitle: "Heat.1995.German.1080p.DL.AC3.BluRay.AVC.Remux-pmHD",
        size: 40582124667,
        created_at: "2026-08-07T07:11:14.000000Z",
        links: {
          "rapidgator.net": ["https://rg.to/file/00000000000000a1"],
          "ddownload.com": [
            "https://ddownload.com/aaaaaaaaaaa1",
            "        https://ddownload.com/aaaaaaaaaaa2",
            "not a link",
          ],
        },
        crypted_links: { "ddownload.com": "https://hide.cx/container/00000001" },
      },
    ],
  },
};

// WCX's detail answer, ddownload's file pages (online but for the dead
// code), and TMDB's entry in the library's language.
function wcx() {
  return mockFetch((url) => {
    if (url.hostname === "api.wcx.test" && url.pathname === "/start/d/heatPage0001") return json(detail);
    if (url.hostname === "ddownload.com") {
      return new Response(
        url.pathname.startsWith("/deaddeaddead")
          ? "<b>File Not Found</b>"
          : '<div class="dk-dl-name" title="Heat.part1.rar"></div>',
      );
    }
    if (url.pathname === "/3/movie/949") {
      return json({
        id: 949,
        title: "Heat",
        original_title: "Heat",
        release_date: "1995-12-15",
        poster_path: "/heat.jpg",
      });
    }
  });
}

describe("GET /api/wcx-releases", () => {
  it("lists the entry's WCX releases, newest first, with their mirrors in the order they're taken", async () => {
    setWcxUid("movie:949", "heatPage0001");
    wcx();
    const { releases } = await (await get("movie:949")).json();
    expect(releases).toEqual([
      {
        uid: "remux",
        name: "Heat.1995.German.1080p.DL.AC3.BluRay.AVC.Remux-pmHD",
        group: "pmHD",
        quality: "1080p",
        seasons: null,
        seasonEpisodes: null,
        size: 40582124667,
        createdAt: "2026-08-07T07:11:14.000000Z",
        // RG before DD, even without a way to fetch it; stray spaces and
        // non-links dropped. Nothing checked yet.
        mirrors: [
          { hoster: "rapidgator.net", source: "wcx", links: 1, route: null, offline: false, container: null },
          { hoster: "ddownload.com", source: "wcx", links: 2, route: "ddownload", offline: false, container: null },
        ],
      },
      {
        uid: "uhd",
        name: "Heat.1995.German.DL.2160p.WebHD.h265-iNNOVATiV",
        group: "iNNOVATiV",
        quality: "2160p",
        seasons: null,
        seasonEpisodes: null,
        size: null,
        createdAt: "2023-12-30T06:12:21.000000Z",
        // The filecrypt container a mirror of its own, after WCX's links,
        // fetched the way its hoster is, its links not known.
        mirrors: [
          { hoster: "ddownload.com", source: "wcx", links: 1, route: "ddownload", offline: false, container: null },
          {
            hoster: "ddownload.com",
            source: "filecrypt",
            links: 0,
            route: "ddownload",
            offline: false,
            container: "https://filecrypt.cc/Container/0000000001.html",
          },
        ],
      },
    ]);
  });

  it("asks WCX again only after a while, and checks no links", async () => {
    setWcxUid("movie:949", "heatPage0001");
    const fetch = wcx();
    await get("movie:949");
    await get("movie:949");
    const calls = (host: string) => fetch.mock.calls.filter(([u]) => String(u).includes(host)).length;
    expect(calls("api.wcx.test")).toBe(1);
    expect(calls("ddownload.com")).toBe(0);
  });

  it("says how many episodes of its season a release holds, as WCX counts them", async () => {
    setWcxUid("tv:205715", "genvPage0001");
    mockFetch((url) => {
      if (url.pathname !== "/start/d/genvPage0001") return undefined;
      return json({
        item: {
          releases: [
            {
              uid: "s01",
              fulltitle: "Gen.V.S01.German.DL.1080p.WEB.h264-w00t",
              links: { "ddownload.com": ["https://ddownload.com/bbbbbbbbbbb1"] },
              options: { episode_count_in_season: "6" },
            },
            {
              uid: "s02",
              fulltitle: "Gen.V.S02.German.DL.1080p.WEB.h264-w00t",
              links: { "ddownload.com": ["https://ddownload.com/bbbbbbbbbbb2"] },
              options: { episode_count_in_season: "" },
            },
          ],
        },
      });
    });
    const { releases } = await (await get("tv:205715")).json();
    expect(releases.map((r: { uid: string; seasonEpisodes: number | null }) => [r.uid, r.seasonEpisodes])).toEqual([
      ["s01", 6],
      ["s02", null],
    ]);
  });

  it("has nothing for an entry without a WCX page, asking nobody", async () => {
    const fetch = mockFetch(() => undefined);
    expect(await (await get("movie:949")).json()).toEqual({ releases: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses anything but a TMDB entry", async () => {
    expect((await get("949")).status).toBe(400);
  });
});

describe("POST /api/wcx-releases", () => {
  it("adds a release from its first online mirror as a package of the title page's entry, and starts it", async () => {
    setWcxUid("movie:949", "heatPage0001");
    wcx();
    // No Real-Debrid for rapidgator: ddownload's links it is.
    const res = await post({ tmdbId: "movie:949", releases: ["remux"] });
    const [pkg] = listPackages();
    expect(await res.json()).toEqual({
      result: "added",
      packageId: pkg.id,
      name: "Heat.1995.German.1080p.DL.AC3.BluRay.AVC.Remux-pmHD",
      started: true,
      hoster: "ddownload.com",
      source: "wcx",
    });
    // Its movie is the entry itself, not a search by the name.
    expect(pkg).toMatchObject({
      status: "queued",
      matched: true,
      media: { type: "movie", tmdbId: 949, title: "Heat", year: 1995, posterPath: "/heat.jpg" },
    });
    expect(queue.kickDownloads).toHaveBeenCalledTimes(1);
    // Named by the hoster before it's started.
    expect(listFiles(pkg.id).map((f) => [f.url, f.name])).toEqual([
      ["https://ddownload.com/aaaaaaaaaaa1", "Heat.part1.rar"],
      ["https://ddownload.com/aaaaaaaaaaa2", "Heat.part1.rar"],
    ]);
  });

  it("leaves one the library has already pending, for a hand", async () => {
    setWcxUid("movie:949", "heatPage0001");
    wcx();
    owned(949);
    const res = await post({ tmdbId: "movie:949", releases: ["remux"] });
    expect(await res.json()).toMatchObject({ result: "added", started: false });
    expect(listPackages()[0].status).toBe("pending");
    expect(queue.kickDownloads).not.toHaveBeenCalled();
  });

  it("offers the filecrypt container when no mirror is online, adding nothing", async () => {
    setWcxUid("movie:949", "heatPage0001");
    wcx();
    expect(await (await post({ tmdbId: "movie:949", releases: ["uhd"] })).json()).toEqual({
      result: "captcha",
      url: "https://filecrypt.cc/Container/0000000001.html",
      hoster: "ddownload.com",
    });
    expect(listPackages()).toEqual([]);
  });

  it("checks a link again only after a while", async () => {
    setWcxUid("movie:949", "heatPage0001");
    const fetch = wcx();
    const checks = () => fetch.mock.calls.filter(([u]) => String(u).includes("ddownload.com")).length;
    await post({ tmdbId: "movie:949", releases: ["uhd"] });
    expect(checks()).toBe(1);
    await post({ tmdbId: "movie:949", releases: ["uhd"] });
    expect(checks()).toBe(1);
  });

  it("refuses what WCX doesn't have, and anything but a TMDB entry with release uids", async () => {
    setWcxUid("movie:949", "heatPage0001");
    wcx();
    expect((await post({ tmdbId: "movie:949", releases: ["nope"] })).status).toBe(404);
    expect((await post({ tmdbId: "movie:949", releases: [] })).status).toBe(400);
    expect((await post({ tmdbId: "movie:949", releases: [1] })).status).toBe(400);
    expect((await post({ tmdbId: "movie:949", release: "remux", hoster: "ddownload.com" })).status).toBe(400);
    expect((await post({ tmdbId: "949", releases: ["remux"] })).status).toBe(400);
    expect(listPackages()).toEqual([]);
  });
});

// A release whose ddownload links are gone, re-uploaded into its hide.cx
// container (two parts, listed out of order), and one whose container is
// gone too.
const reuploaded = {
  item: {
    releases: [
      {
        uid: "fresh",
        fulltitle: "Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR",
        created_at: "2026-09-01T00:00:00.000000Z",
        links: { "ddownload.com": ["https://ddownload.com/deaddeaddead/Heat.part1.rar"] },
        crypted_links: { "ddownload.com": "https://hide.cx/container/11111111-1111-4111-8111-111111111111" },
      },
      {
        uid: "stale",
        fulltitle: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
        created_at: "2026-08-01T00:00:00.000000Z",
        links: { "ddownload.com": ["https://ddownload.com/deaddeaddead/Heat.rar"] },
        crypted_links: { "ddownload.com": "https://hide.cx/container/22222222-2222-4222-8222-222222222222" },
      },
    ],
  },
};

function hideCx(page: unknown = reuploaded, hosterUrl = "https://ddownload.com/new") {
  return mockFetch((url, init) => {
    if (url.hostname === "api.wcx.test" && url.pathname === "/start/d/heatPage0002") return json(page);
    if (url.hostname === "ddownload.com") return new Response("<b>File Not Found</b>");
    if (url.hostname === "api.hide.cx") {
      // Without this Accept, hide.cx answers 404.
      if (!new Headers(init?.headers).get("Accept")?.includes("application/json"))
        return new Response("", { status: 404 });
      const fresh = "/containers/11111111-1111-4111-8111-111111111111";
      if (url.pathname === fresh) {
        return json({
          access_status: "online",
          links: [
            { id: "l2", link_type: "mirror_1", link_status: "online", name: "Heat.part2.rar", hoster_url: null },
            { id: "l1", link_type: "mirror_1", link_status: "online", name: "Heat.part1.rar", hoster_url: null },
          ],
        });
      }
      if (url.pathname === `${fresh}/links/l1`) return json({ url: `${hosterUrl}1` });
      if (url.pathname === `${fresh}/links/l2`) return json({ url: `${hosterUrl}2` });
      if (url.pathname === "/containers/22222222-2222-4222-8222-222222222222") {
        return json({
          access_status: "offline",
          links: [{ id: "x", link_type: "mirror_1", link_status: "offline", name: null, hoster_url: null }],
        });
      }
    }
    if (url.pathname === "/3/movie/949") return json({ id: 949, title: "Heat", release_date: "1995-12-15" });
  });
}

describe("a hide.cx container", () => {
  it("is a mirror of its own, before WCX's links, its links not asked for yet", async () => {
    setWcxUid("movie:949", "heatPage0002");
    const fetch = hideCx();
    const { releases } = await (await get("movie:949")).json();
    expect(releases.map((r: { uid: string; mirrors: unknown[] }) => [r.uid, r.mirrors])).toEqual([
      [
        "fresh",
        [
          {
            hoster: "ddownload.com",
            source: "hide.cx",
            links: 0,
            route: "ddownload",
            offline: false,
            container: "https://hide.cx/container/11111111-1111-4111-8111-111111111111",
          },
          { hoster: "ddownload.com", source: "wcx", links: 1, route: "ddownload", offline: false, container: null },
        ],
      ],
      [
        "stale",
        [
          {
            hoster: "ddownload.com",
            source: "hide.cx",
            links: 0,
            route: "ddownload",
            offline: false,
            container: "https://hide.cx/container/22222222-2222-4222-8222-222222222222",
          },
          { hoster: "ddownload.com", source: "wcx", links: 1, route: "ddownload", offline: false, container: null },
        ],
      ],
    ]);
    expect(fetch.mock.calls.filter(([u]) => String(u).includes("api.hide.cx"))).toEqual([]);
  });

  it("adds the container's links when they're all online, in part order, asking for them only then", async () => {
    setWcxUid("movie:949", "heatPage0002");
    const fetch = hideCx();
    await get("movie:949");
    const linkCalls = () => fetch.mock.calls.filter(([u]) => String(u).includes("/links/")).length;
    expect(linkCalls()).toBe(0);
    const res = await post({ tmdbId: "movie:949", releases: ["fresh"] });
    expect(await res.json()).toMatchObject({ result: "added", hoster: "ddownload.com", source: "hide.cx" });
    expect(linkCalls()).toBe(2);
    const [pkg] = listPackages();
    expect(listFiles(pkg.id).map((f) => f.url)).toEqual(["https://ddownload.com/new1", "https://ddownload.com/new2"]);
  });

  // The fresh release with its container only: no plain WCX links to tell
  // how its hoster is fetched.
  const containerOnly = {
    item: { releases: [{ ...reuploaded.item.releases[0], links: {} }] },
  };

  it("takes one without plain WCX links, its route from its own links", async () => {
    setWcxUid("movie:949", "heatPage0002");
    hideCx(containerOnly, "https://ddownload.com/bbbbbbbbbbb");
    const { releases } = await (await get("movie:949")).json();
    expect(releases[0].mirrors).toMatchObject([{ source: "hide.cx", route: null }]);
    const res = await post({ tmdbId: "movie:949", releases: ["fresh"] });
    expect(await res.json()).toMatchObject({ result: "added", hoster: "ddownload.com", source: "hide.cx" });
    const [pkg] = listPackages();
    expect(listFiles(pkg.id).map((f) => f.url)).toEqual([
      "https://ddownload.com/bbbbbbbbbbb1",
      "https://ddownload.com/bbbbbbbbbbb2",
    ]);
  });

  it("leaves one out whose links nothing can fetch, once they're read", async () => {
    setWcxUid("movie:949", "heatPage0002");
    hideCx(containerOnly, "https://rg.to/file/new");
    expect(await (await post({ tmdbId: "movie:949", releases: ["fresh"] })).json()).toEqual({ result: "none" });
    expect(listPackages()).toEqual([]);
  });

  it("takes the first online mirror of every copy of a release", async () => {
    setWcxUid("movie:949", "heatPage0002");
    hideCx();
    const res = await post({ tmdbId: "movie:949", releases: ["stale", "fresh"] });
    expect(await res.json()).toMatchObject({
      result: "added",
      name: "Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR",
      source: "hide.cx",
    });
    expect(listPackages()).toHaveLength(1);
  });

  it("says when one whose links aren't all online leaves nothing, as WCX's dead ones, after trying both", async () => {
    setWcxUid("movie:949", "heatPage0002");
    const fetch = hideCx();
    expect(await (await post({ tmdbId: "movie:949", releases: ["stale"] })).json()).toEqual({ result: "none" });
    const asked = fetch.mock.calls.map(([u]) => new URL(String(u)));
    expect(asked.map((u) => u.pathname)).toContain("/containers/22222222-2222-4222-8222-222222222222");
    expect(asked.map((u) => u.hostname)).toContain("ddownload.com");
    expect(listPackages()).toEqual([]);
  });
});
