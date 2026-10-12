// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import type { MissingSeason, ShowItem } from "@/lib/api-types";
import { show } from "@/test/fixtures";
import { MissingTable } from "./missing-table";
import { DisksTable } from "./rail";

const season = (n: number, over: Partial<MissingSeason> = {}): MissingSeason => ({
  season: n,
  episodes: "2",
  wholeSeason: false,
  ended: true,
  count: 1,
  total: 3,
  episodeStates: [
    { n: 1, state: "owned" },
    { n: 2, state: "missing" },
    { n: 3, state: "upcoming" },
  ],
  ...over,
});
const dark: ShowItem = {
  ...show({ id: "70523", name: "Dark", year: 2017 }),
  missingEpisodes: null,
  languages: null,
};

describe("MissingTable", () => {
  it("has a row per season with a gap: the show, the season, its episodes as dots, how many", () => {
    render(
      <MissingTable
        shows={[{ item: dark, seasons: [season(1), season(3)], count: 2 }]}
        loading={false}
        onIgnore={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Missing shows · 1 · 2 episodes");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getAllByRole("link", { name: "Dark (2017)" })[0]).toHaveAttribute("href", "/title/tv/70523");
    const dots = rows[0].querySelector(".flex-wrap")!.children;
    expect([...dots].map((d) => d.className)).toEqual([
      expect.stringContaining("bg-muted-foreground"),
      expect.stringContaining("bg-destructive"),
      expect.stringContaining("ring-1"),
    ]);
  });

  it("ignores a season or the whole show from its ⋯", async () => {
    const onIgnore = vi.fn();
    render(
      <MissingTable shows={[{ item: dark, seasons: [season(2)], count: 1 }]} loading={false} onIgnore={onIgnore} />,
    );
    await userEvent.click(screen.getAllByRole("button", { name: "More for Dark Season 2" })[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ignore season 2" }));
    expect(onIgnore).toHaveBeenLastCalledWith({ showId: "70523", season: 2 });
    await userEvent.click(screen.getAllByRole("button", { name: "More for Dark Season 2" })[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ignore entire show" }));
    expect(onIgnore).toHaveBeenLastCalledWith({ showId: "70523", season: null });
  });

  it("says when nothing is missing", () => {
    render(<MissingTable shows={[]} loading={false} onIgnore={vi.fn()} />);
    expect(screen.getByText("Nothing missing")).toBeInTheDocument();
  });
});

describe("DisksTable", () => {
  it("has each disk's free space, red under 5 %, and all of it in the heading", () => {
    render(
      <DisksTable
        loading={false}
        disks={[
          { disk: "nvme01", freeBytes: 40 * 1000 ** 3, totalBytes: 1000 ** 4 },
          { disk: "nvme02", freeBytes: 500 * 1000 ** 3, totalBytes: 1000 ** 4 },
        ]}
      />,
    );
    expect(screen.getByText("nvme01").closest("tr")!.lastElementChild).toHaveClass("text-destructive");
    expect(screen.getByText("nvme02").closest("tr")!.lastElementChild).not.toHaveClass("text-destructive");
  });
});
