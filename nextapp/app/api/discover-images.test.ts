import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { json, mockFetch } from "@/test/http";
import { movie } from "@/test/fixtures";
import { all } from "@/lib/store/sql";
import { addGroup, insertReleases, replaceJellyfin, saveTitleMatch } from "@/lib/store";

// GET /api/discover, /api/image/<id> and /api/tmdb-poster/<type>/<id>.
// TMDB_API_KEY is read from `env` as it's used; TMDB's lookups and the
// Jellyfin image cache are mocked.
const env = vi.hoisted(() => ({ TMDB_API_KEY: "tmdb-key" }));
vi.mock("@/lib/env", async (original) => {
  const mocked = { ...(await original<typeof import("@/lib/env")>()) };
  Object.defineProperty(mocked, "TMDB_API_KEY", { get: () => env.TMDB_API_KEY, enumerable: true });
  return mocked;
});
const tmdb = vi.hoisted(() => ({ searchTmdb: vi.fn(), fetchTmdbTrending: vi.fn(), fetchTmdbEntry: vi.fn() }));
vi.mock("@/lib/tmdb", async (original) => ({ ...(await original<typeof import("@/lib/tmdb")>()), ...tmdb }));
vi.mock("@/lib/availability", async (original) => ({
  ...(await original<typeof import("@/lib/availability")>()),
  withAvailability: async (items: object[]) => items.map((i) => ({ ...i, availability: "released" })),
}));
const images = vi.hoisted(() => ({ getImage: vi.fn() }));
vi.mock("@/lib/image-cache", async (original) => ({
  ...(await original<typeof import("@/lib/image-cache")>()),
  ...images,
}));

beforeEach(() => {
  env.TMDB_API_KEY = "tmdb-key";
  for (const fn of [...Object.values(tmdb), images.getImage]) fn.mockReset();
  // The library's metadata language.
  mockFetch((url) =>
    url.pathname === "/System/Configuration"
      ? json({ PreferredMetadataLanguage: "de", MetadataCountryCode: "DE" })
      : undefined,
  );
});

const result = (tmdbId: number, mediaType: "movie" | "tv" = "movie") => ({
  mediaType,
  tmdbId,
  title: `Title ${tmdbId}`,
  year: 2020,
  releaseDate: "2020-01-01",
  posterPath: `/${tmdbId}.jpg`,
});

describe("GET /api/discover", () => {
  const discover = async (query = "") => {
    const { GET } = await import("./discover/route");
    const res = await GET(new Request("http://jellylens.test/api/discover" + query));
    return { status: res.status, body: await res.json() };
  };
  // Movie 1 is in the library.
  const owned = () =>
    replaceJellyfin(
      { movies: [movie({ Id: "m1", ProviderIds: { Tmdb: "1" } })], shows: [], episodes: [] },
      "2026-10-01T00:00:00.000Z",
    );

  it("searches TMDB, saying which results are owned", async () => {
    owned();
    tmdb.searchTmdb.mockResolvedValue([result(1), result(2)]);
    const { status, body } = await discover("?q=%20title%20");
    expect(status).toBe(200);
    expect(tmdb.searchTmdb).toHaveBeenCalledWith("tmdb-key", "title", "de-DE");
    expect(tmdb.fetchTmdbTrending).not.toHaveBeenCalled();
    expect(body.Items).toMatchObject([
      { tmdbId: 1, library: { id: "m1" }, availability: "released" },
      { tmdbId: 2, library: null },
    ]);
  });

  it("without a query, lists two pages of trending, deduped, owned ones left out", async () => {
    owned();
    tmdb.fetchTmdbTrending.mockImplementation(async (_key: string, _lang: string, page: number) =>
      page === 1 ? [result(1), result(2), result(3)] : [result(3), result(3, "tv"), result(4)],
    );
    const { body } = await discover("?q=%20%20");
    expect(tmdb.searchTmdb).not.toHaveBeenCalled();
    expect(tmdb.fetchTmdbTrending.mock.calls.map((c) => c[2])).toEqual([1, 2]);
    expect(body.Items.map((r: { mediaType: string; tmdbId: number }) => `${r.mediaType}:${r.tmdbId}`)).toEqual([
      "movie:2",
      "movie:3",
      "tv:3",
      "movie:4",
    ]);
  });

  it("keeps trending to 18, counted after the owned ones are out", async () => {
    owned();
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    tmdb.fetchTmdbTrending.mockImplementation(async (_key: string, _lang: string, page: number) =>
      page === 1 ? ids.map((id) => result(id)) : [],
    );
    const { body } = await discover();
    expect(body.Items.map((r: { tmdbId: number }) => r.tmdbId)).toEqual(ids.slice(1, 19));
  });

  it("answers 500 without a TMDB key, 502 when TMDB fails", async () => {
    env.TMDB_API_KEY = "";
    expect(await discover()).toEqual({
      status: 500,
      body: { error: "TMDB_API_KEY is not configured on the backend." },
    });
    env.TMDB_API_KEY = "tmdb-key";
    tmdb.searchTmdb.mockRejectedValue(new Error("TMDB answered HTTP 503"));
    expect(await discover("?q=x")).toEqual({ status: 502, body: { error: "TMDB answered HTTP 503" } });
  });
});

describe("GET /api/image/<id>", () => {
  const ID = "0123456789abcdef0123456789ABCDEF";
  const image = async (id: string, query: string) => {
    const { GET } = await import("./image/[id]/route");
    return GET(new NextRequest(`http://jellylens.test/api/image/${id}?${query}`), {
      params: Promise.resolve({ id }),
    });
  };
  const height = async (h: string) => {
    images.getImage.mockClear();
    images.getImage.mockResolvedValue({ body: Buffer.from("img"), type: "image/webp" });
    await image(ID, `tag=abc&h=${h}`);
    return images.getImage.mock.calls[0][2];
  };

  it("serves the cached image", async () => {
    images.getImage.mockResolvedValue({ body: Buffer.from("img"), type: "image/webp" });
    const res = await image(ID, "tag=Ab9&h=300");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(await res.text()).toBe("img");
    expect(images.getImage).toHaveBeenCalledWith(ID, "Ab9", 320);
  });

  it("snaps the height to 40px steps between 40 and 1200, 240 if not given", async () => {
    expect(await height("300")).toBe(320);
    expect(await height("259")).toBe(240);
    expect(await height("30")).toBe(40);
    expect(await height("-500")).toBe(40);
    expect(await height("5000")).toBe(1200);
    expect(await height("")).toBe(240);
    expect(await height("abc")).toBe(240);
    expect(await height("10")).toBe(40);
  });

  it("refuses ids and tags that aren't Jellyfin's", async () => {
    for (const [id, query] of [
      ["0123", "tag=abc"],
      [ID + "0", "tag=abc"],
      ["../../0123456789abcdef0123456", "tag=abc"],
      [ID, ""],
      [ID, "tag=a-b"],
      [ID, "tag=" + "a".repeat(65)],
      [ID, "tag=..%2Fx"],
    ]) {
      const res = await image(id, query);
      expect(res.status, `${id} ${query}`).toBe(400);
    }
    expect(images.getImage).not.toHaveBeenCalled();
  });

  it("answers 404 when Jellyfin has no image", async () => {
    images.getImage.mockResolvedValue(null);
    expect((await image(ID, "tag=abc")).status).toBe(404);
  });
});

describe("GET /api/tmdb-poster/<type>/<id>", () => {
  // The poster route remembers what it asked for in its module, not on
  // globalThis, so every test uses ids of its own.
  const poster = async (type: string, id: string) => {
    const { GET } = await import("./tmdb-poster/[type]/[id]/route");
    return GET(new Request("http://jellylens.test"), { params: Promise.resolve({ type, id }) });
  };
  const found = (tmdbId: number, posterPath: string | null) => ({
    mediaType: "movie",
    tmdbId,
    title: "Found",
    originalTitle: "Found",
    year: 2026,
    releaseDate: null,
    posterPath,
  });

  it("refuses types and ids it doesn't know", async () => {
    for (const [type, id] of [
      ["person", "1"],
      ["movie", "abc"],
      ["movie", "-1"],
      ["tv", "12345678901"],
      ["movie", ""],
    ]) {
      expect((await poster(type, id)).status, `${type}/${id}`).toBe(400);
    }
    expect(tmdb.fetchTmdbEntry).not.toHaveBeenCalled();
  });

  it("keeps the poster TMDB has now for the titles, and redirects to it", async () => {
    addGroup("g1", "GRPA");
    insertReleases("g1", [
      {
        id: "1",
        titleKey: "new",
        name: "New.2026.German.1080p.WEB.x264-GRPA",
        link: "",
        type: "movie",
        quality: "HD-1080p",
        publishedAt: 1,
      },
    ]);
    saveTitleMatch(
      "new",
      "verified",
      { mediaType: "movie", tmdbId: 101, title: "New", originalTitle: "New", year: null, posterPath: null },
      { title: "New", year: null },
    );
    tmdb.fetchTmdbEntry.mockResolvedValue(found(101, "/new.jpg"));
    const res = await poster("movie", "101");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/api/tmdb-image/w342/new.jpg");
    expect(tmdb.fetchTmdbEntry).toHaveBeenCalledWith("tmdb-key", "movie", 101, "de-DE");
    expect(all("SELECT poster_path AS posterPath, year FROM title_matches WHERE title_key = 'new'")).toEqual([
      { posterPath: "/new.jpg", year: 2026 },
    ]);
    // Found, it may be asked again right away.
    expect((await poster("movie", "101")).status).toBe(302);
  });

  it("asks TMDB at most once an hour while there's no poster", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
      tmdb.fetchTmdbEntry.mockResolvedValue(found(102, null));
      expect((await poster("tv", "102")).status).toBe(404);
      expect((await poster("tv", "102")).status).toBe(404);
      expect(tmdb.fetchTmdbEntry).toHaveBeenCalledTimes(1);
      // Another entry isn't held up.
      tmdb.fetchTmdbEntry.mockRejectedValue(new Error("TMDB down"));
      expect((await poster("movie", "102")).status).toBe(404);
      expect(tmdb.fetchTmdbEntry).toHaveBeenCalledTimes(2);

      vi.setSystemTime(new Date("2026-10-08T13:00:01Z"));
      tmdb.fetchTmdbEntry.mockResolvedValue(found(102, "/late.jpg"));
      expect((await poster("tv", "102")).status).toBe(302);
      expect(tmdb.fetchTmdbEntry).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers 404 without a TMDB key, asking nobody", async () => {
    env.TMDB_API_KEY = "";
    expect((await poster("movie", "103")).status).toBe(404);
    expect(tmdb.fetchTmdbEntry).not.toHaveBeenCalled();
  });
});
