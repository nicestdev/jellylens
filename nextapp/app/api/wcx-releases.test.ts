import { describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import { listFiles, listPackages, setWcxUid } from "@/lib/store";

// GET and POST /api/wcx-releases, with a ddownload account set up (and no
// Real-Debrid), so ddownload mirrors can be fetched and others can't.
vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  DDOWNLOAD_LOGIN: "login",
  DDOWNLOAD_PASSWORD: "password",
}));

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
  it("lists the entry's WCX releases, newest first, with their mirrors", async () => {
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
        size: 40582124667,
        createdAt: "2026-08-07T07:11:14.000000Z",
        // The one we have an account for first; stray spaces and non-links dropped.
        mirrors: [
          { hoster: "ddownload.com", source: "wcx", links: 2, route: "ddownload", offline: false, container: null },
          { hoster: "rapidgator.net", source: "wcx", links: 1, route: null, offline: false, container: null },
        ],
      },
      {
        uid: "uhd",
        name: "Heat.1995.German.DL.2160p.WebHD.h265-iNNOVATiV",
        group: "iNNOVATiV",
        quality: "2160p",
        seasons: null,
        size: null,
        createdAt: "2023-12-30T06:12:21.000000Z",
        // WCX's links gone; the filecrypt container a mirror of its own,
        // fetched the way its hoster is, its links not known.
        mirrors: [
          { hoster: "ddownload.com", source: "wcx", links: 1, route: "ddownload", offline: true, container: null },
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

  it("checks a link again only after a while", async () => {
    setWcxUid("movie:949", "heatPage0001");
    const fetch = wcx();
    await get("movie:949");
    const checks = () => fetch.mock.calls.filter(([u]) => String(u).includes("ddownload.com")).length;
    expect(checks()).toBe(2);
    await get("movie:949");
    expect(checks()).toBe(2);
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
  it("adds a release from the mirror picked, as a pending package of the panel's entry", async () => {
    setWcxUid("movie:949", "heatPage0001");
    wcx();
    // WCX's links when no source is named.
    const res = await post({ tmdbId: "movie:949", release: "remux", hoster: "ddownload.com" });
    expect(await res.json()).toMatchObject({
      name: "Heat.1995.German.1080p.DL.AC3.BluRay.AVC.Remux-pmHD",
      hoster: "ddownload.com",
    });
    const [pkg] = listPackages();
    // Its movie is the entry itself, not a search by the name.
    expect(pkg).toMatchObject({
      status: "pending",
      matched: true,
      media: { type: "movie", tmdbId: 949, title: "Heat", year: 1995, posterPath: "/heat.jpg" },
    });
    expect(listFiles(pkg.id).map((f) => [f.url, f.name])).toEqual([
      ["https://ddownload.com/aaaaaaaaaaa1", "aaaaaaaaaaa1"],
      ["https://ddownload.com/aaaaaaaaaaa2", "aaaaaaaaaaa2"],
    ]);
  });

  it("refuses a mirror whose links are gone, one we have no account for, a filecrypt one, and what WCX doesn't have", async () => {
    setWcxUid("movie:949", "heatPage0001");
    wcx();
    const gone = await post({ tmdbId: "movie:949", release: "uhd", hoster: "ddownload.com" });
    expect(gone.status).toBe(410);
    expect((await gone.json()).error).toMatch(/container/);
    expect((await post({ tmdbId: "movie:949", release: "remux", hoster: "rapidgator.net" })).status).toBe(400);
    expect((await post({ tmdbId: "movie:949", release: "remux", hoster: "nitroflare.com" })).status).toBe(404);
    expect((await post({ tmdbId: "movie:949", release: "nope", hoster: "ddownload.com" })).status).toBe(404);
    expect((await post({ tmdbId: "movie:949", release: "remux" })).status).toBe(400);
    expect(
      (await post({ tmdbId: "movie:949", release: "uhd", hoster: "ddownload.com", source: "filecrypt" })).status,
    ).toBe(400);
    expect(
      (await post({ tmdbId: "movie:949", release: "remux", hoster: "ddownload.com", source: "hide.cx" })).status,
    ).toBe(404);
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

function hideCx() {
  return mockFetch((url, init) => {
    if (url.hostname === "api.wcx.test" && url.pathname === "/start/d/heatPage0002") return json(reuploaded);
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
      if (url.pathname === `${fresh}/links/l1`) return json({ url: "https://ddownload.com/new1" });
      if (url.pathname === `${fresh}/links/l2`) return json({ url: "https://ddownload.com/new2" });
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
  it("is a mirror of its own, live when its links are all online", async () => {
    setWcxUid("movie:949", "heatPage0002");
    hideCx();
    const { releases } = await (await get("movie:949")).json();
    expect(releases.map((r: { uid: string; mirrors: unknown[] }) => [r.uid, r.mirrors])).toEqual([
      [
        "fresh",
        [
          { hoster: "ddownload.com", source: "wcx", links: 1, route: "ddownload", offline: true, container: null },
          {
            hoster: "ddownload.com",
            source: "hide.cx",
            links: 2,
            route: "ddownload",
            offline: false,
            container: "https://hide.cx/container/11111111-1111-4111-8111-111111111111",
          },
        ],
      ],
      [
        "stale",
        [
          { hoster: "ddownload.com", source: "wcx", links: 1, route: "ddownload", offline: true, container: null },
          {
            hoster: "ddownload.com",
            source: "hide.cx",
            links: 0,
            route: "ddownload",
            offline: true,
            container: "https://hide.cx/container/22222222-2222-4222-8222-222222222222",
          },
        ],
      ],
    ]);
  });

  it("adds the container's links, in part order, asking for them only then", async () => {
    setWcxUid("movie:949", "heatPage0002");
    const fetch = hideCx();
    await get("movie:949");
    const linkCalls = () => fetch.mock.calls.filter(([u]) => String(u).includes("/links/")).length;
    expect(linkCalls()).toBe(0);
    const res = await post({ tmdbId: "movie:949", release: "fresh", hoster: "ddownload.com", source: "hide.cx" });
    expect(res.status).toBe(200);
    expect(linkCalls()).toBe(2);
    const [pkg] = listPackages();
    expect(listFiles(pkg.id).map((f) => f.url)).toEqual(["https://ddownload.com/new1", "https://ddownload.com/new2"]);
  });

  it("refuses one whose links aren't all online, as WCX's dead ones", async () => {
    setWcxUid("movie:949", "heatPage0002");
    hideCx();
    expect(
      (await post({ tmdbId: "movie:949", release: "stale", hoster: "ddownload.com", source: "hide.cx" })).status,
    ).toBe(410);
    expect((await post({ tmdbId: "movie:949", release: "fresh", hoster: "ddownload.com" })).status).toBe(410);
    expect(listPackages()).toEqual([]);
  });
});
