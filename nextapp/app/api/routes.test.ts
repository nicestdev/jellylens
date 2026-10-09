import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import type { SessionUser } from "@/lib/session";
import { NextRequest } from "next/server";
import { storedFiles, type MediaFile, type MediaItem } from "@/lib/analytics";
import { addGroup, insertReleases, replaceJellyfin, saveImdbLookup, saveTitleMatch } from "@/lib/store";
import { movie, show } from "@/test/fixtures";

// Route handlers, called directly with a Request. Who's signed in comes
// from a mocked currentUser; cookies go into a mocked jar. proxy.ts (tested
// on its own) already turned away anyone the route shouldn't see.
const auth = vi.hoisted(() => ({ user: null as SessionUser | null }));
vi.mock("@/lib/auth", () => ({ currentUser: async () => auth.user }));

const jar = vi.hoisted(() => new Map<string, { value: string; options?: Record<string, unknown> }>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => jar.set(name, { value, options }),
    delete: (name: string) => jar.delete(name),
  }),
}));

const bob: SessionUser = { id: "u1", name: "Bob", admin: false };
const ana: SessionUser = { id: "u2", name: "Ana", admin: false };
const admin: SessionUser = { id: "a1", name: "Admin", admin: true };

const post = (url: string, body: unknown, method = "POST") =>
  new Request("http://jellylens.test" + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jar.clear();
  auth.user = null;
});

describe("POST /api/auth/login", () => {
  const login = async (body: unknown, headers: Record<string, string> = {}) => {
    const { POST } = await import("./auth/login/route");
    return POST(
      new Request("http://jellylens.test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    );
  };
  const jellyfin = (ok: boolean) =>
    mockFetch((url) => {
      if (url.pathname === "/Users/AuthenticateByName") {
        return ok
          ? json({ AccessToken: "t", User: { Id: "u1", Name: "Bob", Policy: { IsAdministrator: false } } })
          : new Response("", { status: 401 });
      }
      if (url.pathname === "/Sessions/Logout") return new Response(null, { status: 204 });
    });

  it("signs in with Jellyfin credentials and sets the session cookie", async () => {
    const fetch = jellyfin(true);
    const res = await login({ username: " Bob ", password: "pw" }, { "x-forwarded-proto": "https" });
    expect(res.status).toBe(200);
    expect(jar.get("jellylens_session")?.options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true });
    // Jellyfin's own token is signed out again right away.
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith("/Sessions/Logout"))).toBe(true);
  });

  it("doesn't mark the cookie Secure over plain HTTP", async () => {
    jellyfin(true);
    await login({ username: "Bob", password: "pw" });
    expect(jar.get("jellylens_session")?.options).toMatchObject({ secure: false });
  });

  it("refuses wrong credentials, then too many attempts", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      jellyfin(false);
      for (let i = 0; i < 5; i++) {
        const res = login({ username: "Bob", password: "nope" });
        await vi.advanceTimersByTimeAsync(1000);
        expect((await res).status).toBe(401);
      }
      const locked = await login({ username: "bob", password: "right" });
      expect(locked.status).toBe(429);
      expect(locked.headers.get("Retry-After")).toBe(String(15 * 60));
      expect(jar.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for a username, and reports Jellyfin being down", async () => {
    expect((await login({ username: "  ", password: "x" })).status).toBe(400);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(() => Promise.reject(new Error("ECONNREFUSED")) as never);
    expect((await login({ username: "Bob", password: "x" })).status).toBe(502);
  });
});

describe("/api/requests", () => {
  beforeEach(() => {
    // The library's metadata language, and no release dates for anything.
    mockFetch((url) => {
      if (url.pathname === "/System/Configuration")
        return json({ PreferredMetadataLanguage: "de", MetadataCountryCode: "DE" });
      if (url.pathname.endsWith("/release_dates")) return json({ results: [] });
    });
  });

  const heat = {
    mediaType: "movie",
    tmdbId: 949,
    title: "Heat",
    year: 1995,
    releaseDate: "1995-12-15",
    posterPath: "/h.jpg",
  };
  const call = async (method: "GET" | "POST" | "DELETE", body?: unknown) => {
    const route = await import("./requests/route");
    const res = method === "GET" ? await route.GET() : await route[method](post("/api/requests", body, method));
    return { status: res.status, body: await res.json() };
  };

  it("keeps each user's own list", async () => {
    auth.user = bob;
    await call("POST", heat);
    auth.user = ana;
    expect((await call("GET")).body.Items).toEqual([]);
    await call("POST", heat);
    expect((await call("GET")).body.Items).toMatchObject([{ title: "Heat", mine: true }]);
  });

  it("shows admins everyone's, with who asked", async () => {
    auth.user = bob;
    await call("POST", heat);
    auth.user = admin;
    const { body } = await call("GET");
    expect(body.all).toBe(true);
    expect(body.admin).toBe(true);
    expect(body.Items).toMatchObject([{ title: "Heat", mine: false, requesters: [{ name: "Bob" }] }]);
  });

  it("takes back one user's request; an admin can remove it for everyone", async () => {
    auth.user = bob;
    await call("POST", heat);
    auth.user = ana;
    await call("POST", heat);
    await call("DELETE", { mediaType: "movie", tmdbId: 949 });
    expect((await call("GET")).body.Items).toEqual([]);
    auth.user = bob;
    expect((await call("GET")).body.Items).toHaveLength(1);

    auth.user = admin;
    await call("DELETE", { mediaType: "movie", tmdbId: 949, everyone: true });
    auth.user = bob;
    expect((await call("GET")).body.Items).toEqual([]);
  });

  it("says which favorite groups have released each request", async () => {
    const { addGroup, insertReleases, saveTitleMatch } = await import("@/lib/store");
    addGroup("g1", "VECTOR");
    insertReleases("g1", [
      {
        id: "r1",
        name: "Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR",
        link: "https://www.xrel.to/p2p/r1",
        type: "movie",
        quality: "HD-2160p",
        publishedAt: 1000,
        titleKey: "heat",
        imdbId: "tt0113277",
      },
    ]);
    saveTitleMatch(
      "heat",
      "verified",
      { ...heat, mediaType: "movie", originalTitle: "Heat" },
      { title: "Heat", year: 1995 },
    );
    auth.user = bob;
    await call("POST", heat);
    await call("POST", { ...heat, tmdbId: 1, title: "Silo" });
    const items = (await call("GET")).body.Items as { title: string; releaseGroups: string[] }[];
    expect(items.map((r) => [r.title, r.releaseGroups])).toEqual(
      expect.arrayContaining([
        ["Heat", ["VECTOR"]],
        ["Silo", []],
      ]),
    );
  });

  it("rejects malformed bodies", async () => {
    auth.user = bob;
    expect((await call("POST", { mediaType: "book", tmdbId: 1, title: "x" })).status).toBe(400);
    expect((await call("POST", { mediaType: "movie", tmdbId: "1", title: "x" })).status).toBe(400);
    expect((await call("POST", { mediaType: "movie", tmdbId: 1 })).status).toBe(400);
  });

  it("needs someone signed in", async () => {
    expect((await call("GET")).status).toBe(401);
  });
});

describe("GET /api/collections", () => {
  it("says which favorite groups have released each part you don't own", async () => {
    const store = await import("@/lib/store");
    const part = (tmdbId: number, title: string) => ({ tmdbId, title, releaseDate: "1995-12-15", posterPath: null });
    store.replaceTmdb(
      {},
      { c1: { name: "Heat Collection", posterPath: null, parts: [part(949, "Heat"), part(1, "Heat 2")] } },
      null,
    );
    store.replaceMissing(
      {},
      {
        c1: {
          count: 1,
          parts: [
            { ...part(1, "Heat 2"), owned: false },
            { ...part(949, "Heat"), owned: true },
          ],
        },
      },
      {},
      null,
    );
    store.addGroup("g1", "VECTOR");
    store.insertReleases("g1", [
      {
        id: "r1",
        name: "Heat.2.2026.German.DL.2160p.WEB.x265-VECTOR",
        link: "https://www.xrel.to/p2p/r1",
        type: "movie",
        quality: "HD-2160p",
        publishedAt: 1000,
        titleKey: "heat2",
        imdbId: "tt1",
      },
      {
        id: "r2",
        name: "Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR",
        link: "https://www.xrel.to/p2p/r2",
        type: "movie",
        quality: "HD-2160p",
        publishedAt: 1000,
        titleKey: "heat",
        imdbId: "tt0113277",
      },
    ]);
    store.saveTitleMatch(
      "heat2",
      "verified",
      { ...part(1, "Heat 2"), mediaType: "movie", originalTitle: "Heat 2", year: 2026 },
      { title: "Heat 2", year: 2026 },
    );
    store.saveTitleMatch(
      "heat",
      "verified",
      { ...part(949, "Heat"), mediaType: "movie", originalTitle: "Heat", year: 1995 },
      { title: "Heat", year: 1995 },
    );

    const { GET } = await import("./collections/route");
    const body = await (await GET()).json();
    expect(
      body.Items[0].parts.map((p: { title: string; releaseGroups: string[] }) => [p.title, p.releaseGroups]),
    ).toEqual([
      ["Heat 2", ["VECTOR"]],
      ["Heat", []],
    ]);
  });
});

describe("PATCH /api/preferences", () => {
  it("takes known options and rejects anything else", async () => {
    const { PATCH } = await import("./preferences/route");
    expect(await (await PATCH(post("/api/preferences", { showSdReleases: true }, "PATCH"))).json()).toEqual({
      showSdReleases: true,
    });
    expect((await PATCH(post("/api/preferences", { showSdReleases: "yes" }, "PATCH"))).status).toBe(400);
    expect((await PATCH(post("/api/preferences", { showFileNames: true }, "PATCH"))).status).toBe(400);
    expect((await PATCH(post("/api/preferences", { admin: true }, "PATCH"))).status).toBe(400);
  });
});

describe("/api/ignored", () => {
  it("adds and removes entries, and rejects malformed ones", async () => {
    const route = await import("./ignored/route");
    const entry = { kind: "collection", collectionId: "c1", movieId: null };
    expect(await (await route.POST(post("/api/ignored", entry))).json()).toEqual({ Items: [entry] });
    expect(await (await route.DELETE(post("/api/ignored", entry, "DELETE"))).json()).toEqual({ Items: [] });
    expect((await route.POST(post("/api/ignored", { kind: "missing", seriesId: "s", season: "1" }))).status).toBe(400);
    expect((await route.POST(post("/api/ignored", { kind: "other", seriesId: "s", season: 1 }))).status).toBe(400);
  });
});

describe("GET /api/movies and /api/analytics", () => {
  const library = () => {
    const item = (kind: "movie" | "episode", id: string, title: string, files: MediaFile[]): MediaItem => ({
      kind,
      id,
      parentId: kind === "movie" ? id : "s1",
      title,
      year: null,
      tmdbId: null,
      season: kind === "movie" ? null : 1,
      episode: kind === "movie" ? null : 1,
      files,
    });
    replaceJellyfin(
      {
        movies: [
          movie({ Id: "m1", Name: "Heat", FileName: "Heat.1995.1080p.x264-GRP.mkv" }),
          movie({ Id: "m2", Name: "Alien" }),
        ],
        shows: [show({ Id: "s1", Name: "Silo" })],
        episodes: [],
        files: storedFiles([
          item("movie", "m1", "Heat", [
            { Name: "Heat.1995.1080p.x264-GRP.mkv", Size: 42, Codec: "h264", Width: 1920, Height: 800 },
          ]),
          item("movie", "m2", "Alien", [{ Name: "Alien.mkv", Size: 8, Codec: "" }]),
          item("episode", "e1", "Silo", [{ Name: "Silo.S01E01.1080p.WEB.h264-cnhd.mkv", Size: 3, Codec: "h264" }]),
        ]),
      },
      "2026-10-01T00:00:00.000Z",
    );
  };
  const files = async (query: string) => {
    const { GET } = await import("./analytics/files/route");
    return (await GET(new NextRequest("http://jellylens.test/api/analytics/files?" + query))).json();
  };

  it("keeps file names out of the movie list, but gives each its codec", async () => {
    library();
    const { GET } = await import("./movies/route");
    const [heat, alien] = (await (await GET()).json()).Items;
    expect(heat).toMatchObject({ Id: "m1", Codec: "x264" });
    expect(heat).not.toHaveProperty("FileName");
    expect(alien).toMatchObject({ Id: "m2", Codec: "" });
  });

  it("sums up each library's files by group, resolution, codec and language", async () => {
    library();
    const { GET } = await import("./analytics/route");
    const body = await (await GET()).json();
    expect(body.shows).toMatchObject({
      titles: 1,
      withFiles: 1,
      files: 1,
      groups: [{ value: "cnhd", files: 1, size: 3 }],
    });
    expect({ ...body, shows: undefined }).toEqual({
      movies: {
        titles: 2,
        withFiles: 2,
        files: 2,
        size: 50,
        pending: false,
        groups: [
          { value: "GRP", files: 1, size: 42 },
          { value: null, files: 1, size: 8 },
        ],
        resolutions: [
          { value: "1080p", files: 1, size: 42 },
          { value: "", files: 1, size: 8 },
        ],
        codecs: [
          { value: "x264", files: 1, size: 42 },
          { value: "", files: 1, size: 8 },
        ],
        languages: [{ value: "", files: 2, size: 50 }],
      },
      syncedAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("pages the files, searched and filtered", async () => {
    library();
    expect(await files("")).toMatchObject({ matched: 2, pageSize: 50, Items: [{ title: "Alien" }, { title: "Heat" }] });
    expect(await files("q=heat 1995")).toMatchObject({
      matched: 1,
      Items: [{ fileName: "Heat.1995.1080p.x264-GRP.mkv" }],
    });
    // An empty value: files without a group, or an unknown codec.
    expect(await files("group=")).toMatchObject({ matched: 1, Items: [{ title: "Alien" }] });
    expect(await files("group=grp&codec=x264&resolution=1080p")).toMatchObject({
      matched: 1,
      Items: [{ title: "Heat" }],
    });
    expect(await files("sort=size")).toMatchObject({ Items: [{ size: 42 }, { size: 8 }] });
    expect(await files("sort=nonsense&offset=1")).toMatchObject({ matched: 2, Items: [{ title: "Heat" }] });
    expect(await files("library=shows")).toMatchObject({
      matched: 1,
      Items: [{ title: "Silo", season: 1, episode: 1 }],
    });
  });
});

describe("GET /api/upgrades", () => {
  const upgrades = async (query: string) => {
    const { GET } = await import("./upgrades/route");
    return (await GET(new NextRequest("http://jellylens.test/api/upgrades?" + query))).json();
  };

  it("has each owned movie with the favorites' releases of it, and the library's groups", async () => {
    replaceJellyfin(
      {
        movies: [movie({ Id: "m1", Name: "Heat" })],
        shows: [],
        episodes: [],
        files: storedFiles([
          {
            kind: "movie",
            id: "m1",
            parentId: "m1",
            title: "Heat",
            year: 1995,
            tmdbId: "949",
            files: [{ Name: "Heat.1995.German.1080p.BluRay.x264-w00t.mkv", Size: 8, Codec: "h264", Width: 1920 }],
          },
        ]),
      },
      "2026-10-01T00:00:00.000Z",
    );
    addGroup("g1", "VECTOR");
    insertReleases("g1", [
      {
        id: "r1",
        name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
        link: "https://www.xrel.to/p2p/r1",
        type: "movie",
        quality: "HD-1080p",
        publishedAt: 1000,
        sizeMb: 2,
        titleKey: "t1",
      },
    ]);
    saveTitleMatch(
      "t1",
      "verified",
      { mediaType: "movie", tmdbId: 949, title: "Heat", originalTitle: "Heat", year: 1995, posterPath: null },
      { title: "Heat", year: 1995 },
    );

    const body = await upgrades("library=movies");
    expect(body).toMatchObject({
      groups: [{ value: "w00t", files: 1, size: 8 }],
      favorites: ["VECTOR"],
      sizesPending: true,
      syncedAt: null,
    });
    expect(body.units).toEqual([
      expect.objectContaining({
        key: "m1",
        tier: "1080p",
        alternatives: [expect.objectContaining({ group: "VECTOR", size: 2 * 1024 * 1024, audio: "DL" })],
      }),
    ]);
    expect(await upgrades("library=shows")).toMatchObject({ units: [], groups: [] });
  });
});

describe("/api/release-groups", () => {
  // xREL's search: P2P hits for "-NAME", scene hits for "NAME". Whatever
  // else the background sync asks gets an empty answer.
  const xrel = ({ p2p = [] as string[], scene = [] as string[] } = {}) =>
    mockFetch((url) => {
      if (url.pathname === "/v2/search/releases.json") {
        const q = url.searchParams.get("q")!.toLowerCase();
        if (url.searchParams.get("scene") === "1") {
          const name = scene.find((n) => n.toLowerCase() === q);
          return json({
            results: name
              ? [{ id: "s1", dirname: `X.1080p.WEB-${name}`, link_href: "", time: 0, group_name: name }]
              : [],
          });
        }
        const name = p2p.find((n) => "-" + n.toLowerCase() === q);
        return json({
          p2p_results: name ? [{ id: "r", dirname: "x", link_href: "", pub_time: 0, group: { id: "g1", name } }] : [],
        });
      }
      if (url.pathname === "/v2/p2p/releases.json")
        return json({ total_count: 0, pagination: { current_page: 1, per_page: 100, total_pages: 0 }, list: [] });
      if (url.pathname === "/System/Configuration") return json({});
    });
  // Searches are spaced 2.5 s apart; skip the waits.
  async function withoutWaits<T>(fn: () => Promise<T>): Promise<T> {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const result = fn();
      await vi.advanceTimersByTimeAsync(10_000);
      return await result;
    } finally {
      vi.useRealTimers();
    }
  }
  const route = () => import("./release-groups/route");

  it("adds a P2P group found on xREL, spelled as xREL does", async () => {
    xrel({ p2p: ["VECTOR"] });
    const { POST } = await route();
    const res = await POST(post("/api/release-groups", { name: "vector" }));
    expect(await res.json()).toMatchObject({ Items: [{ id: "g1", kind: "p2p", name: "VECTOR", count: 0 }] });
  });

  it("adds a scene group found on xREL, spelled as xREL does", async () => {
    xrel({ scene: ["FuN"] });
    const { POST } = await route();
    const res = await POST(post("/api/release-groups", { name: "fun", kind: "scene" }));
    expect(await res.json()).toMatchObject({ Items: [{ id: "scene:FuN", kind: "scene", name: "FuN", count: 0 }] });
  });

  it("adds a group once", async () => {
    const fetch = xrel({ scene: ["WAYNE"] });
    const { POST } = await route();
    await POST(post("/api/release-groups", { name: "WAYNE", kind: "scene" }));
    const searches = () => fetch.mock.calls.filter(([u]) => String(u).includes("/search/")).length;
    const before = searches();
    const res = await POST(post("/api/release-groups", { name: "wayne", kind: "scene" }));
    expect((await res.json()).Items).toHaveLength(1);
    expect(searches()).toBe(before);
  });

  it("points to the other list when the group is of the other kind, and tells a typo apart", async () => {
    xrel({ p2p: ["VECTOR"], scene: ["WAYNE"] });
    const { POST } = await route();
    const asP2p = await withoutWaits(() => POST(post("/api/release-groups", { name: "WAYNE" })));
    expect(asP2p.status).toBe(404);
    expect(await asP2p.json()).toEqual({ error: "WAYNE is a scene group — add it under Scene groups instead." });
    const asScene = await withoutWaits(() => POST(post("/api/release-groups", { name: "VECTOR", kind: "scene" })));
    expect(await asScene.json()).toEqual({ error: "VECTOR is a P2P group — add it under P2P groups instead." });
    const typo = await withoutWaits(() => POST(post("/api/release-groups", { name: "NOPE", kind: "scene" })));
    expect(await typo.json()).toEqual({ error: "xREL doesn't list a scene group called NOPE." });
  });

  it("says so when xREL is out of calls", async () => {
    mockFetch(() => new Response("", { status: 429 }));
    const { POST } = await route();
    expect((await POST(post("/api/release-groups", { name: "VECTOR" }))).status).toBe(429);
  });

  it("rejects names that can't be a group", async () => {
    const { POST } = await route();
    expect((await POST(post("/api/release-groups", { name: "a b" }))).status).toBe(400);
    expect((await POST(post("/api/release-groups", { name: "" }))).status).toBe(400);
  });

  it("removes a group by id", async () => {
    addGroup("g1", "VECTOR");
    addGroup("scene:WAYNE", "WAYNE", "scene");
    const { DELETE, GET } = await route();
    const res = await DELETE(post("/api/release-groups", { id: "scene:WAYNE" }, "DELETE"));
    expect((await res.json()).Items.map((g: { name: string }) => g.name)).toEqual(["VECTOR"]);
    expect((await (await GET()).json()).Items).toHaveLength(1);
    expect((await DELETE(post("/api/release-groups", {}, "DELETE"))).status).toBe(400);
  });
});

describe("/api/releases/<key>", () => {
  const heat = {
    mediaType: "movie" as const,
    tmdbId: 949,
    title: "Heat",
    originalTitle: "Heat",
    year: 1995,
    posterPath: null,
  };
  const release = (id: string, titleKey: string, name: string, publishedAt: number) => ({
    id,
    titleKey,
    name,
    link: "",
    type: "movie",
    quality: "HD-1080p",
    publishedAt,
  });
  async function seed() {
    const store = await import("@/lib/store");
    store.addGroup("g1", "VECTOR");
    store.insertReleases("g1", [
      release("1", "heat", "Heat.1995.German.DL.1080p.BluRay.x265-VECTOR", 200),
      release("2", "heat-sd", "Heat.German.AC3.HDRip.XViD-VECTOR", 100),
    ]);
    store.saveTitleMatch("heat", "verified", heat, { title: "Heat", year: 1995 });
    store.saveTitleMatch("heat-sd", "searched", heat, { title: "Heat", year: null });
  }
  const params = (key: string) => ({ params: Promise.resolve({ key }) });

  it("lists a tile's xREL titles with their releases", async () => {
    await seed();
    const { GET } = await import("./releases/[key]/route");
    const body = await (await GET(new Request("http://jellylens.test"), params("movie:949"))).json();
    expect(body.key).toBe("movie:949");
    expect(body.titles.map((t: { titleKey: string; label: string }) => [t.titleKey, t.label])).toEqual([
      ["heat", "Heat (1995)"],
      ["heat-sd", "Heat"],
    ]);
  });

  it("takes a decision about one of them, and follows a title off its tile", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    await seed();
    const { POST } = await import("./releases/[key]/route");
    const res = await POST(
      post("/api/releases/movie:949", { titleKey: "heat-sd", verdict: "wrong" }),
      params("movie:949"),
    );
    expect((await res.json()).titles.map((t: { titleKey: string }) => t.titleKey)).toEqual(["heat"]);

    const last = await POST(
      post("/api/releases/movie:949", { titleKey: "heat", verdict: "wrong" }),
      params("movie:949"),
    );
    const body = await last.json();
    expect(body.key).toBe("heat");
    expect(body.titles[0].match).toMatchObject({ status: "rejected", verdict: "wrong" });
  });

  it("refuses a title that isn't on the tile, and malformed bodies", async () => {
    await seed();
    const { POST } = await import("./releases/[key]/route");
    expect((await POST(post("/x", { titleKey: "nope", verdict: "wrong" }), params("movie:949"))).status).toBe(404);
    expect((await POST(post("/x", { titleKey: "heat", verdict: "maybe" }), params("movie:949"))).status).toBe(400);
    expect((await POST(post("/x", { verdict: "wrong" }), params("movie:949"))).status).toBe(400);
  });
});

describe("GET /api/tmdb-image", () => {
  it("refuses sizes and names it doesn't serve", async () => {
    const { GET } = await import("./tmdb-image/[size]/[file]/route");
    const call = (size: string, file: string) =>
      GET(new Request("http://x"), { params: Promise.resolve({ size, file }) });
    expect((await call("original", "a.jpg")).status).toBe(400);
    expect((await call("w342", "..%2Fsecret")).status).toBe(400);
  });
});

describe("POST /api/sync/<stage>", () => {
  it("starts the stage and answers right away; /api/status follows it", async () => {
    mockFetch(() => new Promise<Response>(() => {})); // Jellyfin never answers
    const { POST } = await import("./sync/[stage]/route");
    const { GET } = await import("./status/route");

    const res = await POST(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ stage: "jellyfin" }),
    });
    expect(res.status).toBe(202);
    const status = await (await GET()).json();
    expect(status.jellyfin).toMatchObject({ running: true, error: null });
    expect(status.tmdb.running).toBe(false);
  });

  it("reports a failed run's error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./sync/[stage]/route");
    const { GET } = await import("./status/route");
    // The missing recheck fails without a TMDB sync to compare against.
    await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ stage: "missing" }) });
    await new Promise((resolve) => setImmediate(resolve));
    expect((await (await GET()).json()).missing).toMatchObject({
      running: false,
      error: expect.stringMatching(/Sync TMDB first/),
    });
  });

  it("refuses an unknown stage", async () => {
    const { POST } = await import("./sync/[stage]/route");
    expect(
      (await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ stage: "toString" }) }))
        .status,
    ).toBe(404);
  });
});

describe("GET /api/wcx-search", () => {
  const call = async (params: string) => {
    const { GET } = await import("./wcx-search/route");
    return GET(new Request("http://jellylens.test/api/wcx-search?" + params));
  };
  const heat = {
    mediaType: "movie" as const,
    tmdbId: 949,
    title: "Heat",
    originalTitle: "Heat",
    year: 1995,
    posterPath: null,
  };

  it("searches WCX by the IMDb id a release's lookup found, and stores a hit", async () => {
    saveImdbLookup("tt0113277", heat);
    const fetch = mockFetch((url) => {
      if (url.hostname === "api.wcx.test")
        return json({ items: { data: [{ uid: "abc123", options: { imdb_id: "tt0113277" } }] } });
    });
    const res = await call("tmdbId=movie:949");
    expect(await res.json()).toEqual({ url: "https://wcx.test/detail/abc123" });
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("q")).toBe("tt0113277");

    // The second call answers from the database.
    const fetch2 = mockFetch(() => {
      throw new Error("should not be called");
    });
    const res2 = await call("tmdbId=movie:949");
    expect(await res2.json()).toEqual({ url: "https://wcx.test/detail/abc123" });
    expect(fetch2).not.toHaveBeenCalled();
  });

  it("asks TMDB for the IMDb id when no release came across the entry", async () => {
    const fetch = mockFetch((url) => {
      if (url.pathname === "/3/tv/1399/external_ids") return json({ imdb_id: "tt0944947" });
      if (url.hostname === "api.wcx.test")
        return json({
          items: { data: [{ uid: "got", type: "series", options: { imdb_id: "tt0944947", tmdb_id: 1399 } }] },
        });
    });
    expect(await (await call("tmdbId=tv:1399")).json()).toEqual({ url: "https://wcx.test/detail/got" });
    const wcx = fetch.mock.calls.map(([u]) => new URL(String(u))).find((u) => u.hostname === "api.wcx.test");
    expect(wcx?.searchParams.get("q")).toBe("tt0944947");
  });

  it("remembers that nobody knows the IMDb id, asking nobody the next time", async () => {
    const fetch = mockFetch((url) => {
      if (url.pathname === "/3/movie/1/external_ids") return new Response("", { status: 404 });
    });
    expect(await (await call("tmdbId=movie:1")).json()).toEqual({ url: null });
    expect(fetch.mock.calls.some(([u]) => String(u).includes("api.wcx.test"))).toBe(false);
    const fetch2 = mockFetch(() => undefined);
    expect(await (await call("tmdbId=movie:1")).json()).toEqual({ url: null });
    expect(fetch2).not.toHaveBeenCalled();
  });

  it("remembers that WCX has nothing, asking nobody the next time", async () => {
    saveImdbLookup("tt0113277", heat);
    mockFetch((url) => {
      if (url.hostname === "api.wcx.test") return json({ items: { data: [] } });
    });
    expect(await (await call("tmdbId=movie:949")).json()).toEqual({ url: null });
    const fetch2 = mockFetch(() => undefined);
    expect(await (await call("tmdbId=movie:949")).json()).toEqual({ url: null });
    expect(fetch2).not.toHaveBeenCalled();
  });

  it("skips a hit that is another entry with a similar IMDb id", async () => {
    saveImdbLookup("tt16248144", { ...heat, tmdbId: 893364 });
    mockFetch((url) => {
      if (url.hostname === "api.wcx.test")
        return json({
          items: {
            data: [
              { uid: "jaguar", type: "movie", options: { imdb_id: "tt16740144", tmdb_id: 959098 } },
              { uid: "belle", type: "movie", options: { imdb_id: "tt16248144", tmdb_id: 893364 } },
            ],
          },
        });
    });
    expect(await (await call("tmdbId=movie:893364")).json()).toEqual({ url: "https://wcx.test/detail/belle" });
  });

  it("finds nothing when every hit is another entry", async () => {
    saveImdbLookup("tt16248144", { ...heat, tmdbId: 893364 });
    mockFetch((url) => {
      if (url.hostname === "api.wcx.test")
        return json({
          items: { data: [{ uid: "jaguar", type: "movie", options: { imdb_id: "tt16740144", tmdb_id: 959098 } }] },
        });
    });
    expect(await (await call("tmdbId=movie:893364")).json()).toEqual({ url: null });
  });

  it("asks again after a failed request, which isn't remembered", async () => {
    saveImdbLookup("tt0113277", heat);
    mockFetch(() => new Response("", { status: 503 }));
    expect(await (await call("tmdbId=movie:949")).json()).toEqual({ url: null });
    // TMDB failing for an entry no release came across isn't remembered either.
    expect(await (await call("tmdbId=tv:5")).json()).toEqual({ url: null });

    mockFetch((url) => {
      if (url.pathname === "/3/tv/5/external_ids") return json({ imdb_id: "tt5" });
      if (url.hostname === "api.wcx.test") {
        const q = url.searchParams.get("q");
        return json({ items: { data: [{ uid: "found", options: { imdb_id: q } }] } });
      }
    });
    expect(await (await call("tmdbId=movie:949")).json()).toEqual({ url: "https://wcx.test/detail/found" });
    expect(await (await call("tmdbId=tv:5")).json()).toEqual({ url: "https://wcx.test/detail/found" });
  });

  it("requires a TMDB entry", async () => {
    expect((await call("")).status).toBe(400);
    expect((await call("tmdbId=movie:abc")).status).toBe(400);
    expect((await call("tmdbId=person:1")).status).toBe(400);
  });
});
