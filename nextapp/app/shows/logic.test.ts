import { describe, expect, it } from "vitest";
import type { ShowItem } from "@/lib/api-types";
import { show } from "@/test/fixtures";
import { showMeta, showView } from "./logic";
import type { LibraryFilters } from "@/lib/facets";

const item = (over: Partial<ShowItem> & { Id: string }): ShowItem => ({
  MissingEpisodes: null,
  Mismatches: null,
  Languages: null,
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
      Id: "1",
      Name: "Dark",
      Status: "Ended",
      ChildCount: 3,
      RecursiveItemCount: 26,
      Languages: coverage({ de: 26 }, 26),
    }),
    item({
      Id: "2",
      Name: "Severance",
      Status: "Continuing",
      ChildCount: 2,
      RecursiveItemCount: 19,
      Languages: coverage({ en: 19 }, 19),
    }),
    item({ Id: "3", Name: "Chernobyl", Status: "Ended", ChildCount: 1, RecursiveItemCount: 5 }),
  ];
  const names = (view: ReturnType<typeof showView>) => view.rows.map((s) => s.Name);

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
  const dark = item({ Id: "1", ProductionYear: 2017, ChildCount: 3, RecursiveItemCount: 26 });

  it("shows seasons, or episodes while sorting by them", () => {
    expect(showMeta(dark, "title")).toBe("2017 · 3 seasons");
    expect(showMeta(dark, "episodes")).toBe("2017 · 26 episodes");
    expect(showMeta(item({ Id: "2" }), "title")).toBe("");
  });
});
