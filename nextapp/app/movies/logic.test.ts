import { describe, expect, it } from "vitest";
import type { MovieItem } from "@/lib/api-types";
import { movie as stored } from "@/test/fixtures";
import { movieMeta, movieView } from "./logic";
import type { LibraryFilters } from "@/lib/facets";

// A movie as /api/movies sends it.
const movie = (over: Partial<MovieItem> & { Id: string }): MovieItem => ({ ...stored(over), Codec: "", ...over });

const noFilters = (over: Partial<LibraryFilters> = {}): LibraryFilters => ({
  query: "",
  genres: new Set(),
  langs: new Set(),
  ...over,
});

describe("movieMeta", () => {
  it("shows the year and the runtime in minutes", () => {
    expect(movieMeta(movie({ Id: "a", ProductionYear: 2010, RunTimeTicks: 148 * 600000000 }))).toBe(
      "2010 · 148\u202fmin",
    );
    expect(movieMeta(movie({ Id: "a" }))).toBe("");
  });
});

describe("movieView", () => {
  const movies = [
    movie({ Id: "1", Name: "Inception", ProductionYear: 2010, Genres: ["Sci-Fi"], AudioLanguages: ["en", "de"] }),
    movie({ Id: "2", Name: "Amélie", ProductionYear: 2001, Genres: ["Comedy"], AudioLanguages: ["fr"] }),
    movie({ Id: "3", Name: "Interstellar", ProductionYear: 2014, Genres: ["Sci-Fi", "Drama"], AudioLanguages: ["en"] }),
  ];
  const names = (view: ReturnType<typeof movieView>) => view.rows.map((m) => m.Name);

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
