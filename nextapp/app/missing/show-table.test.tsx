// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import type { ShowItem } from "@/lib/api-types";
import { show } from "@/test/fixtures";
import type { Group } from "./logic";
import { ShowList, gapLabel } from "./show-table";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const item = (over: Partial<ShowItem> = {}): ShowItem => ({
  ...show({ Id: "s1", Name: "Dark", ProductionYear: 2017, ProviderIds: { Tmdb: "70523" } }),
  MissingEpisodes: null,
  Mismatches: null,
  Languages: null,
  ...over,
});

const group: Group = {
  item: item(),
  lines: [
    { season: 1, episodes: "3-4", count: 2 },
    { season: 2, episodes: "", count: 8, wholeSeason: true },
    { season: 3, episodes: "2", count: 1, airing: true },
  ],
};

const list = (onIgnore = vi.fn(), groups = [group]) =>
  render(<ShowList groups={groups} kind="missing" onIgnore={onIgnore} />);

describe("gapLabel", () => {
  it("names the season and its episodes, just the season when all of it is off", () => {
    expect(gapLabel({ season: 1, episodes: "3-4, 9", count: 3 })).toBe("S01·E3–4, E9");
    expect(gapLabel({ season: 2, episodes: "", count: 8, wholeSeason: true })).toBe("S02");
    expect(gapLabel({ season: 12, episodes: "", count: 1, extraSeason: true })).toBe("S12");
  });
});

describe("ShowList", () => {
  it("shows a poster per season with the show's name and year", () => {
    list();
    const tiles = screen.getAllByTitle("Dark");
    expect(tiles.map((t) => t.tagName)).toEqual(["BUTTON", "BUTTON", "BUTTON"]);
    expect(screen.getAllByText("2017")).toHaveLength(3);
    expect(screen.getByText("S01·E3–4")).toBeInTheDocument();
    expect(screen.getByText("S03·E2")).toBeInTheDocument();
  });

  it("badges what's missing plainly, whatever the category", () => {
    list();
    const gap = screen.getByText("S01·E3–4");
    expect(gap).toHaveClass("bg-background/75");
    expect(gap).toHaveAttribute("title", "2 missing: S01·E3–4");
    expect(screen.getByText("S02")).toHaveAttribute("title", "All 8 of season 2 missing");
    expect(screen.getByText("S03·E2")).toHaveClass("bg-background/75");
  });

  it("says a mismatch isn't on TMDB", () => {
    render(
      <ShowList
        groups={[{ item: item(), lines: [{ season: 4, episodes: "", count: 1, extraSeason: true }] }]}
        kind="mismatch"
        onIgnore={vi.fn()}
      />,
    );
    expect(screen.getByText("S04")).toHaveAttribute("title", "Season 4 isn't on TMDB");
  });

  it("opens the show's title page, or nothing without a TMDB id", async () => {
    push.mockClear();
    const { unmount } = list();
    await userEvent.click(screen.getAllByTitle("Dark")[0]);
    expect(push).toHaveBeenCalledWith("/title/tv/70523");
    unmount();
    list(vi.fn(), [{ ...group, item: item({ ProviderIds: {} }) }]);
    expect(screen.getAllByTitle("Dark").map((t) => t.tagName)).toEqual(["DIV", "DIV", "DIV"]);
  });

  it("ignores a season or the whole show from its menu", async () => {
    const onIgnore = vi.fn();
    list(onIgnore);
    const menus = () => screen.getAllByRole("button", { name: "More options for Dark" });
    expect(menus()).toHaveLength(3);
    await userEvent.click(menus()[1]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ignore season 2" }));
    await userEvent.click(menus()[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ignore entire show" }));
    expect(onIgnore.mock.calls.map(([e]) => e)).toEqual([
      { kind: "missing", seriesId: "s1", season: 2 },
      { kind: "missing", seriesId: "s1", season: null },
    ]);
  });
});
