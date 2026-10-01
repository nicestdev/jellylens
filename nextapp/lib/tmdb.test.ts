import { describe, expect, it, vi } from "vitest";
import {
  earliestReleases,
  fetchImdbId,
  fetchTmdbShow,
  fetchTmdbTitles,
  findTmdbByImdb,
  releaseCountries,
  searchTmdb,
  searchTmdbTitle,
  toResult,
  TmdbError,
} from "./tmdb";
import { json, mockFetch } from "@/test/http";

describe("the TMDB request", () => {
  it("sends the API key and params", async () => {
    const fetch = mockFetch(() => json({ results: [] }));
    await searchTmdb("key", "heat", "de-DE");
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/3/search/multi");
    expect(Object.fromEntries(url.searchParams)).toEqual({ query: "heat", language: "de-DE", include_adult: "false", api_key: "key" });
  });

  it("waits out a 429 and tries again", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      mockFetch(() =>
        ++calls === 1 ? new Response("", { status: 429, headers: { "retry-after": "2" } }) : json({ seasons: [] })
      );
      const show = fetchTmdbShow("key", "1");
      await vi.advanceTimersByTimeAsync(2000);
      expect(await show).toEqual({ seasons: [] });
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up on a 429 after three retries", async () => {
    vi.useFakeTimers();
    try {
      const fetch = mockFetch(() => new Response("", { status: 429 }));
      const show = fetchTmdbShow("key", "1").catch((e) => e);
      await vi.advanceTimersByTimeAsync(5000);
      expect(await show).toBeInstanceOf(TmdbError);
      expect(fetch).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tells a missing entry (null) from a failed request (throws)", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    expect(await fetchTmdbShow("key", "1")).toBeNull();
    mockFetch(() => new Response("", { status: 500 }));
    await expect(fetchTmdbShow("key", "1")).rejects.toMatchObject({ status: 500 });
  });
});

describe("earliestReleases", () => {
  const dates = (country: string, ...entries: [number, string][]) => ({
    iso_3166_1: country,
    release_dates: entries.map(([type, release_date]) => ({ type, release_date })),
  });

  it("takes each kind's earliest date in the given countries", () => {
    const raw = {
      results: [
        dates("DE", [3, "2026-02-01T00:00:00Z"], [4, "2026-05-01T00:00:00Z"]),
        dates("US", [2, "2026-01-15T00:00:00Z"], [5, "2026-06-01T00:00:00Z"], [1, "2025-09-01T00:00:00Z"]),
        dates("FR", [4, "2025-12-01T00:00:00Z"]),
      ],
    };
    expect(earliestReleases(raw, ["DE", "US"])).toEqual({ theatrical: "2026-01-15", digital: "2026-05-01", physical: "2026-06-01" });
  });

  it("falls back to every country when none of the given ones has dates", () => {
    expect(earliestReleases({ results: [dates("FR", [4, "2025-12-01T00:00:00Z"])] }, ["DE"])).toEqual({
      theatrical: null,
      digital: "2025-12-01",
      physical: null,
    });
  });

  it("uses the library's country and the US", () => {
    expect(releaseCountries("de-DE")).toEqual(["DE", "US"]);
    expect(releaseCountries("en-US")).toEqual(["US"]);
    expect(releaseCountries("en")).toEqual(["US"]);
  });
});

describe("toResult", () => {
  it("drops people and entries without a poster", () => {
    expect(toResult({ media_type: "person", id: 1, name: "Al Pacino", poster_path: "/p.jpg" })).toBeNull();
    expect(toResult({ media_type: "movie", id: 1, title: "Heat", poster_path: null })).toBeNull();
    expect(toResult({ media_type: "tv", id: 2, name: "Silo", first_air_date: "2023-05-04", poster_path: "/s.jpg" })).toEqual({
      mediaType: "tv",
      tmdbId: 2,
      title: "Silo",
      year: 2023,
      releaseDate: "2023-05-04",
      posterPath: "/s.jpg",
    });
  });
});

describe("findTmdbByImdb", () => {
  it("takes the preferred kind when TMDB lists both", async () => {
    mockFetch(() =>
      json({
        movie_results: [{ id: 1, title: "Movie", release_date: "2020-01-01" }],
        tv_results: [{ id: 2, name: "Show", original_name: "Show", first_air_date: "2019-01-01" }],
      })
    );
    expect(await findTmdbByImdb("key", "tt1", "de-DE", "tv")).toMatchObject({ mediaType: "tv", tmdbId: 2, year: 2019 });
    expect(await findTmdbByImdb("key", "tt1", "de-DE", "movie")).toMatchObject({ mediaType: "movie", tmdbId: 1 });
  });

  it("takes the other kind, or null", async () => {
    mockFetch(() => json({ movie_results: [], tv_results: [{ id: 2, name: "Show" }] }));
    expect(await findTmdbByImdb("key", "tt1", "de-DE", "movie")).toMatchObject({ mediaType: "tv" });
    mockFetch(() => json({ movie_results: [], tv_results: [] }));
    expect(await findTmdbByImdb("key", "tt1", "de-DE", "movie")).toBeNull();
  });
});

describe("fetchImdbId", () => {
  it("gives a TMDB entry's IMDb id, or null if it has none or TMDB doesn't know it", async () => {
    const fetch = mockFetch((url) => {
      if (url.pathname === "/3/tv/1399/external_ids") return json({ imdb_id: "tt0944947" });
      if (url.pathname === "/3/movie/2/external_ids") return json({ imdb_id: null });
      return new Response("", { status: 404 });
    });
    expect(await fetchImdbId("key", "tv", 1399)).toBe("tt0944947");
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("api_key")).toBe("key");
    expect(await fetchImdbId("key", "movie", 2)).toBeNull();
    expect(await fetchImdbId("key", "movie", 3)).toBeNull();
  });

  it("fails on other errors, which the caller handles", async () => {
    mockFetch(() => new Response("", { status: 500 }));
    await expect(fetchImdbId("key", "movie", 1)).rejects.toThrow(TmdbError);
  });
});

describe("searchTmdbTitle", () => {
  it("narrows by the right year param per kind", async () => {
    const fetch = mockFetch(() => json({ results: [] }));
    await searchTmdbTitle("key", "movie", "Heat", 1995, "de-DE");
    await searchTmdbTitle("key", "tv", "Silo", 2023, "de-DE");
    await searchTmdbTitle("key", "movie", "Heat", null, "de-DE");
    const params = fetch.mock.calls.map(([u]) => Object.fromEntries(new URL(String(u)).searchParams));
    expect(params[0]).toMatchObject({ year: "1995" });
    expect(params[1]).toMatchObject({ first_air_date_year: "2023" });
    expect(params[2]).not.toHaveProperty("year");
  });
});

describe("fetchTmdbTitles", () => {
  it("gathers alternative titles and translations, once each", async () => {
    mockFetch(() =>
      json({
        alternative_titles: { titles: [{ title: "Poseidon Inferno" }, { title: "Poseidon" }] },
        translations: { translations: [{ data: { title: "Die Höllenfahrt der Poseidon" } }, { data: { title: "Poseidon" } }, { data: {} }] },
      })
    );
    expect(await fetchTmdbTitles("key", "movie", 551)).toEqual(["Poseidon Inferno", "Poseidon", "Die Höllenfahrt der Poseidon"]);
  });

  it("has none for an entry TMDB removed", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    expect(await fetchTmdbTitles("key", "movie", 1)).toEqual([]);
  });

  it("reads shows' alternative titles from results", async () => {
    mockFetch(() => json({ alternative_titles: { results: [{ title: "Silo (DE)" }] }, translations: { translations: [{ data: { name: "Silo" } }] } }));
    expect(await fetchTmdbTitles("key", "tv", 1)).toEqual(["Silo (DE)", "Silo"]);
  });
});
