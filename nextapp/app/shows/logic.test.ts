import { describe, expect, it } from "vitest";
import type { ShowItem } from "@/lib/api-types";
import { show } from "@/test/fixtures";
import { showMeta, showView } from "./logic";
import type { LibraryFilters } from "@/lib/facets";

// The values as the poster shows them, with its spaced dots.
const shownMeta = (parts: unknown[]) => parts.filter(Boolean).join(" · ");

const item = (over: Partial<ShowItem> & { id: string }): ShowItem => ({
  missingEpisodes: null,
  languages: null,
  ...show(over),
  ...over,
});

const noFilters = (over: Partial<LibraryFilters> = {}): LibraryFilters => ({
  query: "",
  genres: new Set(),
  langs: new Set(),
  ...over,
});

const coverage = (byLang: Record<string, number>, total: number) => ({ total, byLang, seasons: [] });

describe("showView", () => {
  const shows = [
    item({
      id: "1",
      name: "Dark",
      status: "Ended",
      seasonCount: 3,
      episodeCount: 26,
      languages: coverage({ de: 26 }, 26),
    }),
    item({
      id: "2",
      name: "Severance",
      status: "Continuing",
      seasonCount: 2,
      episodeCount: 19,
      languages: coverage({ en: 19 }, 19),
    }),
    item({ id: "3", name: "Chernobyl", status: "Ended", seasonCount: 1, episodeCount: 5 }),
  ];
  const names = (view: ReturnType<typeof showView>) => view.rows.map((s) => s.name);

  it("filters by a language any episode has", () => {
    expect(names(showView(shows, noFilters({ langs: new Set(["en"]) }), "title", "asc"))).toEqual(["Severance"]);
  });

  it("sorts by episodes and adds them all up", () => {
    const view = showView(shows, noFilters(), "episodes", "desc");
    expect(names(view)).toEqual(["Dark", "Severance", "Chernobyl"]);
    expect(view.totalEpisodes).toBe(50);
  });
});

describe("showMeta", () => {
  const dark = item({ id: "1", year: 2017, seasonCount: 3, episodeCount: 26 });

  it("shows seasons, or episodes while sorting by them", () => {
    expect(shownMeta(showMeta(dark, "title"))).toBe("2017 · 3 seasons");
    expect(shownMeta(showMeta(dark, "episodes"))).toBe("2017 · 26 episodes");
    expect(shownMeta(showMeta(item({ id: "2" }), "title"))).toBe("");
  });
});
