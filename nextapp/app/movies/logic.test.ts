import { describe, expect, it } from "vitest";
import type { MovieItem } from "@/lib/api-types";
import { movie as stored } from "@/test/fixtures";
import { movieMeta, movieView } from "./logic";
import type { LibraryFilters } from "@/lib/facets";

// A movie as /api/movies sends it.
const movie = (over: Partial<MovieItem> & { id: string }): MovieItem => ({ ...stored(over), codec: "", ...over });

const noFilters = (over: Partial<LibraryFilters> = {}): LibraryFilters => ({
  query: "",
  genres: new Set(),
  langs: new Set(),
  ...over,
});

describe("movieMeta", () => {
  it("shows the year and the runtime in minutes", () => {
    expect(movieMeta(movie({ id: "a", year: 2010, runtime: 148 * 60 }))).toBe("2010 · 148\u202fmin");
    expect(movieMeta(movie({ id: "a" }))).toBe("");
  });
});

describe("movieView", () => {
  const movies = [
    movie({ id: "1", name: "Inception", year: 2010, genres: ["Sci-Fi"], audioLanguages: ["en", "de"] }),
    movie({ id: "2", name: "Amélie", year: 2001, genres: ["Comedy"], audioLanguages: ["fr"] }),
    movie({ id: "3", name: "Interstellar", year: 2014, genres: ["Sci-Fi", "Drama"], audioLanguages: ["en"] }),
  ];
  const names = (view: ReturnType<typeof movieView>) => view.rows.map((m) => m.name);

  it("searches names and combines facets", () => {
    expect(names(movieView(movies, noFilters({ query: " INTER " }), "title", "asc"))).toEqual(["Interstellar"]);
    expect(
      names(movieView(movies, noFilters({ genres: new Set(["Sci-Fi"]), langs: new Set(["de"]) }), "title", "asc")),
    ).toEqual(["Inception"]);
  });

  it("sorts by the picked key", () => {
    expect(names(movieView(movies, noFilters(), "title", "asc"))).toEqual(["Amélie", "Inception", "Interstellar"]);
    expect(names(movieView(movies, noFilters(), "year", "desc"))).toEqual(["Interstellar", "Inception", "Amélie"]);
  });

  it("counts the menus over the whole library and says whether anything narrows it", () => {
    const view = movieView(movies, noFilters({ genres: new Set(["Comedy"]) }), "title", "asc");
    expect(Object.fromEntries(view.langCounts)).toEqual({ en: 2, de: 1, fr: 1 });
    expect(view.genreCounts.get("Sci-Fi")).toBe(2);
    expect(view.narrowed).toBe(true);
    expect(movieView(movies, noFilters({ query: "  " }), "title", "asc").narrowed).toBe(false);
  });
});
