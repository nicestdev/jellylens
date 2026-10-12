import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncNewTmdb, syncTmdb } from "./sync-tmdb";
import { getMovies, getShows, getTmdbShows, replaceLibrary, replaceTmdb } from "./store";
import { openDatabase, useDatabase } from "./db";
import { json, mockFetch } from "@/test/http";
import { movie, show } from "@/test/fixtures";

const sync = () => syncTmdb({ tmdbApiKey: "key", language: "de-DE" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  replaceLibrary(
    {
      movies: [movie({ id: "1", tmdbId: "1" })],
      shows: [show({ id: "10", tmdbId: "10" })],
      episodes: [],
    },
    "2026-06-15T00:00:00Z",
  );
  return () => vi.useRealTimers();
});

// A TMDB with one show (two seasons plus specials) and one movie.
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
      name: "Teil 1",
      genres: ["Krimi"],
      posterPath: "/1.jpg",
    });
    expect(getShows()[0]).toMatchObject({ name: "Silo", genres: ["Drama"], posterPath: "/silo.jpg", status: "Ended" });
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
    expect(result).toMatchObject({ shows: 1, failed: 0 });
    expect(getTmdbShows()["10"]).toEqual({
      tmdbId: "10",
      seasons: [
        { season: 1, airedEpisodeNumbers: [1, 2], episodeNumbers: [1, 2] },
        { season: 2, airedEpisodeNumbers: [1], episodeNumbers: [1, 2, 3] },
      ],
    });
  });

  it("keeps the last sync's show when TMDB fails, instead of losing its seasons", async () => {
    tmdb();
    await sync();
    const before = getTmdbShows()["10"];

    tmdb({ "/3/tv/10/season/2": () => new Response("", { status: 500 }) });
    const result = await sync();

    expect(result.failed).toBe(1);
    expect(getTmdbShows()["10"]).toEqual(before);
  });

  it("drops what TMDB no longer has", async () => {
    replaceTmdb({ "10": { tmdbId: "10", seasons: [] } }, "2026-06-01T00:00:00Z");
    tmdb({ "/3/tv/10": () => new Response("", { status: 404 }) });
    const result = await sync();
    expect(result).toMatchObject({ shows: 0, failed: 0 });
    expect(getTmdbShows()).toEqual({});
  });
});

describe("syncNewTmdb", () => {
  const syncNew = () => syncNewTmdb("key");

  it("asks only about the shows new since the last sync, keeping the rest", async () => {
    const known = { tmdbId: "10", seasons: [{ season: 1, airedEpisodeNumbers: [1], episodeNumbers: [1] }] };
    replaceTmdb({ "10": known }, "2026-06-01T00:00:00Z");
    const fetch = tmdb();
    expect(await syncNew()).toEqual({ shows: 0 });
    expect(getTmdbShows()["10"]).toEqual(known);
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/3/tv/10"))).toBe(false);
  });

  it("gets a new show's seasons, and leaves one that fails for the next sync", async () => {
    replaceTmdb({}, "2026-06-01T00:00:00Z");
    tmdb({ "/3/tv/10": () => new Response("", { status: 500 }) });
    expect(await syncNew()).toEqual({ shows: 0 });
    expect(getTmdbShows()).toEqual({});
    tmdb();
    expect(await syncNew()).toEqual({ shows: 1 });
    expect(getTmdbShows()["10"].seasons.map((s) => s.season)).toEqual([1, 2]);
  });
});
