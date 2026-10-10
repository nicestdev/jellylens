import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncTmdb } from "./sync-tmdb";
import { getMovies, getShows, getTmdbCollections, getTmdbSeries, replaceLibrary, replaceTmdb } from "./store";
import { openDatabase, useDatabase } from "./db";
import { json, mockFetch } from "@/test/http";
import { movie, show } from "@/test/fixtures";

const sync = () => syncTmdb({ tmdbApiKey: "key", language: "de-DE" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  replaceLibrary(
    {
      movies: [movie({ Id: "1", ProviderIds: { Tmdb: "1", TmdbCollection: "c" } })],
      shows: [show({ Id: "10", ProviderIds: { Tmdb: "10" } })],
      episodes: [],
    },
    "2026-06-15T00:00:00Z",
  );
  return () => vi.useRealTimers();
});

// A TMDB with one show (two seasons plus specials) and one movie in one
// collection.
function tmdb(overrides: Record<string, () => Response> = {}) {
  return mockFetch((url) => {
    const override = overrides[url.pathname];
    if (override) return override();
    switch (url.pathname) {
      case "/3/tv/10":
        return json({
          name: "Silo",
          first_air_date: "2023-05-04",
          genres: [{ name: "Drama" }],
          poster_path: "/silo.jpg",
          status: "Ended",
          seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }],
        });
      case "/3/movie/1":
        return json({
          title: "Teil 1",
          release_date: "2001-01-01",
          genres: [{ name: "Krimi" }],
          poster_path: "/1.jpg",
          belongs_to_collection: { id: "c" },
        });
      case "/3/tv/10/season/1":
        return json({
          episodes: [
            { episode_number: 2, air_date: "2023-05-12" },
            { episode_number: 1, air_date: "2023-05-05" },
          ],
        });
      case "/3/tv/10/season/2":
        return json({
          episodes: [
            { episode_number: 1, air_date: "2026-06-01" },
            { episode_number: 2, air_date: "2026-07-01" },
            { episode_number: 3, air_date: null },
          ],
        });
      case "/3/collection/c":
        return json({
          name: "The Collection",
          parts: [
            { id: 3, title: "Part 3", release_date: "2026-03-01" },
            { id: 1, title: "Part 1", release_date: "2001-01-01" },
            { id: 9, title: "Undated" },
            { id: 8, media_type: "tv", title: "Not a movie" },
          ],
        });
      case "/3/movie/3/release_dates":
        return json({
          results: [{ iso_3166_1: "DE", release_dates: [{ type: 3, release_date: "2026-03-01T00:00:00Z" }] }],
        });
    }
  });
}

describe("syncTmdb", () => {
  it("needs a library scan first", async () => {
    useDatabase(openDatabase(":memory:"));
    await expect(sync()).rejects.toThrow(/Scan the library first/);
  });

  it("asks TMDB again about every title and writes what changed into the library", async () => {
    const fetch = tmdb();
    await sync();
    expect(getMovies()[0]).toMatchObject({
      Name: "Teil 1",
      Genres: ["Krimi"],
      PosterPath: "/1.jpg",
      ProviderIds: { Tmdb: "1", TmdbCollection: "c" },
    });
    expect(getShows()[0]).toMatchObject({ Name: "Silo", Genres: ["Drama"], PosterPath: "/silo.jpg", Status: "Ended" });
    // In the library's language.
    expect(
      new URL(String(fetch.mock.calls.find(([u]) => String(u).includes("/3/movie/1?"))![0])).searchParams.get(
        "language",
      ),
    ).toBe("de-DE");
  });

  it("stores each show's seasons without specials, and aired episodes separately", async () => {
    tmdb();
    const result = await sync();
    expect(result).toMatchObject({ shows: 1, collections: 1, failed: 0 });
    expect(getTmdbSeries()["10"]).toEqual({
      tmdbId: "10",
      seasons: [
        { season: 1, airedEpisodeNumbers: [1, 2], episodeNumbers: [1, 2] },
        { season: 2, airedEpisodeNumbers: [1], episodeNumbers: [1, 2, 3] },
      ],
    });
  });

  it("stores collections' movie parts by date, with release dates for recent ones", async () => {
    const fetch = tmdb();
    await sync();
    const c = getTmdbCollections().c;
    expect(c.name).toBe("The Collection");
    expect(c.parts.map((p) => p.tmdbId)).toEqual([1, 3, 9]);
    expect(c.parts[1].releases).toEqual({ theatrical: "2026-03-01", digital: null, physical: null });
    expect(c.parts[0].releases).toBeUndefined();
    // Only the recent part's release dates were asked for.
    expect(fetch.mock.calls.filter(([u]) => String(u).includes("release_dates"))).toHaveLength(1);
  });

  it("keeps the last sync's show when TMDB fails, instead of losing its seasons", async () => {
    tmdb();
    await sync();
    const before = getTmdbSeries()["10"];

    tmdb({ "/3/tv/10/season/2": () => new Response("", { status: 500 }) });
    const result = await sync();

    expect(result.failed).toBe(1);
    expect(getTmdbSeries()["10"]).toEqual(before);
  });

  it("keeps the last sync's collection when TMDB fails", async () => {
    tmdb();
    await sync();
    const before = getTmdbCollections().c;

    tmdb({ "/3/collection/c": () => new Response("", { status: 503 }) });
    await sync();
    expect(getTmdbCollections().c).toEqual(before);
  });

  it("keeps a part's last release dates when they can't be fetched", async () => {
    tmdb();
    await sync();
    tmdb({ "/3/movie/3/release_dates": () => new Response("", { status: 500 }) });
    await sync();
    expect(getTmdbCollections().c.parts[1].releases).toEqual({
      theatrical: "2026-03-01",
      digital: null,
      physical: null,
    });
  });

  it("drops what TMDB no longer has", async () => {
    replaceTmdb({ "10": { tmdbId: "10", seasons: [] } }, {}, "2026-06-01T00:00:00Z");
    tmdb({
      "/3/tv/10": () => new Response("", { status: 404 }),
      "/3/collection/c": () => new Response("", { status: 404 }),
    });
    const result = await sync();
    expect(result).toMatchObject({ shows: 0, collections: 0, failed: 0 });
    expect(getTmdbSeries()).toEqual({});
  });
});
