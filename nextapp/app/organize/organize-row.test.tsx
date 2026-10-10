// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import type { OrganizeItem, OrganizeMoved } from "@/lib/api-types";
import type { MoveProgress } from "@/lib/library-move";
import { OrganizeRow, MovedRow } from "./organize-row";

const GB = 1e9;
const item: OrganizeItem = {
  id: 1,
  name: "Gen.V.S01-S02.German.1080p-w00t",
  media: { type: "tv", tmdbId: 205715, title: "Gen V", year: 2023, posterPath: null },
  folder: "Gen V (2023) [tmdbid-205715]",
  files: ["Season 01/Gen.V.S01E01.mkv", "Season 01/Gen.V.S01E02.mkv", "Season 02/Gen.V.S02E01.mkv"],
  bytes: 3 * GB,
  error: null,
  targets: [
    { path: "/library/nvme01/shows", disk: "nvme01", freeBytes: GB, existing: null },
    { path: "/library/nvme02/shows", disk: "nvme02", freeBytes: 80 * GB, existing: null },
  ],
  owned: [],
  move: null,
};
const progress = (over: Partial<MoveProgress> = {}): MoveProgress => ({
  target: "/library/nvme02/shows",
  back: false,
  done: 1.5 * GB,
  total: 3 * GB,
  phase: "copying",
  speed: 100e6,
  running: true,
  error: null,
  ...over,
});
const moved: OrganizeMoved = {
  id: 2,
  name: "Heat.1995.German-WAYNE",
  media: { type: "movie", tmdbId: 949, title: "Heat", year: 1995, posterPath: null },
  movedTo: "nvme01/movies/Heat (1995) [tmdbid-949]",
  movedAt: new Date().toISOString(),
  files: ["Heat.1995.mkv"],
  bytes: 8 * GB,
  replaced: false,
  move: null,
};

const table = (row: React.ReactNode) =>
  render(
    <table>
      <tbody>{row}</tbody>
    </table>,
  );
// The ⋯ and the disk menu are there twice, on a phone in the title cell and
// from sm up in a column of their own (CSS shows one); the column's comes last.
const more = () => screen.getAllByRole("button", { name: /^More for / }).at(-1)!;
const disk = () => screen.getAllByRole("button", { name: "Disk" }).at(-1)!;

describe("OrganizeRow", () => {
  it("shows the title over its folder, season folders and every file, a step in each", () => {
    table(<OrganizeRow item={item} onPick={vi.fn()} onMove={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Gen V")).toBeInTheDocument();
    for (const text of ["Gen V (2023) [tmdbid-205715]", "Season 01", "Season 02", "Gen.V.S02E01.mkv"])
      expect(screen.getByText(text)).toBeInTheDocument();
    const file = screen.getByText("Gen.V.S01E01.mkv").parentElement!;
    expect(file).toHaveAttribute("title", "Gen.V.S01E01.mkv");
    expect(file).toHaveStyle({ paddingLeft: "24px" });
    // The first disk it fits on, not the first.
    expect(disk()).toHaveTextContent("nvme02");
    // Nothing to say about it in Status.
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("moves it to the disk picked, from its menu", async () => {
    const onMove = vi.fn();
    const onPick = vi.fn();
    const { rerender } = table(<OrganizeRow item={item} onPick={onPick} onMove={onMove} onDelete={vi.fn()} />);
    await userEvent.click(disk());
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /nvme01/ })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /nvme02/ }));
    expect(onPick).toHaveBeenCalledWith("/library/nvme02/shows");

    rerender(
      <table>
        <tbody>
          <OrganizeRow item={item} picked="/library/nvme02/shows" onPick={onPick} onMove={onMove} onDelete={vi.fn()} />
        </tbody>
      </table>,
    );
    await userEvent.click(more());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Move" }));
    expect(onMove).toHaveBeenCalledWith("/library/nvme02/shows", undefined);
  });

  it("shows how far a move is, with nothing to pick or do meanwhile", () => {
    table(<OrganizeRow item={{ ...item, move: progress() }} onPick={vi.fn()} onMove={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getAllByText(/^Moving · [\d.]+ MB\/s · /)).toHaveLength(2);
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Disk" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^More for / })).toBeNull();
  });

  it("offers Retry after a failure, its reason in Status", async () => {
    const onMove = vi.fn();
    const failed = {
      ...item,
      move: progress({ running: false, error: "Gen.V.S01E01.mkv: the copy doesn't match the original" }),
    };
    table(<OrganizeRow item={failed} onPick={vi.fn()} onMove={onMove} onDelete={vi.fn()} />);
    for (const line of screen.getAllByText("The copy doesn't match the original"))
      expect(line).toHaveAttribute("title", "Gen.V.S01E01.mkv: the copy doesn't match the original");
    await userEvent.click(more());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Retry" }));
    expect(onMove).toHaveBeenCalledWith("/library/nvme02/shows", undefined);
  });

  it("says why one can't be moved, under its release name, and offers only Delete", async () => {
    const blocked = {
      ...item,
      media: null,
      files: [],
      targets: [],
      error: "It isn't matched to a movie or show on TMDB.",
    };
    table(<OrganizeRow item={blocked} onPick={vi.fn()} onMove={vi.fn()} onDelete={vi.fn()} />);
    for (const line of screen.getAllByText("It isn't matched to a movie or show on TMDB"))
      expect(line).toHaveClass("text-destructive");
    // No disk to pick; its ⋯ only deletes it.
    expect(screen.queryByRole("button", { name: "Disk" })).toBeNull();
    await userEvent.click(more());
    expect((await screen.findAllByRole("menuitem")).map((i) => i.textContent)).toEqual(["Delete"]);
  });

  it("shows what the library has already red over the new files green, and asks what to do", async () => {
    const onMove = vi.fn();
    const onDelete = vi.fn();
    const owned = {
      ...item,
      files: ["Season 01/Gen.V.S01E01.mkv"],
      owned: [
        {
          path: "nvme02/shows/Gen V (2023) [tmdbid-205715]/Season 01/Gen.V.S01E01.720p-OLD.mkv",
          size: GB,
          extras: [],
        },
      ],
    };
    table(<OrganizeRow item={owned} onPick={vi.fn()} onMove={onMove} onDelete={onDelete} />);
    expect(screen.getByText("Gen.V.S01E01.720p-OLD.mkv").parentElement).toHaveClass("text-destructive");
    expect(screen.getByText("Gen.V.S01E01.mkv").parentElement).toHaveClass("text-success");
    expect(screen.getByLabelText("In library")).toBeInTheDocument();
    await userEvent.click(more());
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Add as version", "Replace", "Delete"]);
    await userEvent.click(items[0]);
    expect(onMove).toHaveBeenCalledWith("/library/nvme02/shows", false);
    await userEvent.click(more());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Replace" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sure? Click again" }));
    expect(onMove).toHaveBeenLastCalledWith("/library/nvme02/shows", true);
  });
});

describe("MovedRow", () => {
  it("shows where it went and when, and moves it back from its menu", async () => {
    const onUndo = vi.fn();
    table(<MovedRow item={moved} onUndo={onUndo} />);
    expect(screen.getByText("Heat (1995) [tmdbid-949]")).toBeInTheDocument();
    expect(screen.getByText("Heat.1995.mkv")).toBeInTheDocument();
    expect(screen.getAllByText(/^Moved /)).toHaveLength(2);
    await userEvent.click(more());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("calls an Undo running Undoing, and offers nothing for a move without its files known", () => {
    const { unmount } = table(<MovedRow item={{ ...moved, move: progress({ back: true }) }} onUndo={vi.fn()} />);
    expect(screen.getAllByText(/^Undoing · /)).toHaveLength(2);
    unmount();
    table(<MovedRow item={{ ...moved, files: [] }} onUndo={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says Replaced for one that replaced what the library had, with no Undo", () => {
    table(<MovedRow item={{ ...moved, replaced: true }} onUndo={vi.fn()} />);
    expect(screen.getAllByText(/^Replaced /)).toHaveLength(2);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
