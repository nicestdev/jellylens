// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import type { LibraryAnalytics } from "@/lib/api-types";
import { noListFilters, type ListFilters } from "./logic";
import { ShareChart } from "./share-chart";

const GB = 1024 ** 3;

const movies: LibraryAnalytics = {
  titles: 4,
  withFiles: 4,
  files: 4,
  size: 4 * GB,
  pending: false,
  groups: [
    { value: "FuN", files: 3, size: GB },
    { value: "GRP", files: 1, size: 3 * GB },
  ],
  resolutions: [
    { value: "1080p", files: 3, size: GB },
    { value: "4K", files: 1, size: 3 * GB },
  ],
  codecs: [
    { value: "x265", files: 3, size: GB },
    { value: "x264", files: 1, size: 3 * GB },
  ],
  languages: [
    { value: "DE", files: 4, size: 4 * GB },
    { value: "EN", files: 1, size: GB },
  ],
};

const chart = (over: { filters?: ListFilters; onSelect?: () => void } = {}) =>
  render(<ShareChart stats={movies} filters={over.filters ?? noListFilters()} onSelect={over.onSelect ?? (() => {})} />);

describe("ShareChart", () => {
  it("has a ring each for files and storage by group, and files by resolution and codec", () => {
    chart();
    expect(screen.getByRole("button", { name: "FuN: 3 files, 75 % of files by group" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GRP: 3,00 GB, 75 % of storage by group" })).toBeInTheDocument();
    // A legend per ring, with that ring's share and value.
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "FuN75 %3",
      "GRP25 %1",
      "FuN25 %1,00 GB",
      "GRP75 %3,00 GB",
      // Resolutions and codecs with the most files first.
      "1080p75 %3",
      "4K25 %1",
      "x26575 %3",
      "x26425 %1",
      // Languages out of every file, so they can add up to more.
      "German100 %4",
      "English25 %1",
    ]);
  });

  it("has a ring per audio language, out of every file, that lists its files", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    chart({ onSelect });
    await user.click(screen.getByRole("button", { name: "English: 1 file, 25 % of all files" }));
    expect(onSelect.mock.calls.map(([s]) => [s.dimension, s.values])).toEqual([["languages", ["EN"]]]);
  });

  it("shows the totals in the middle, or the piece under the pointer", async () => {
    const user = userEvent.setup();
    chart();
    expect(screen.getByText("4,00 GB")).toBeInTheDocument();
    expect(screen.getAllByText("files")).toHaveLength(3);

    const grp = screen.getByRole("button", { name: /^GRP: 1 file/ });
    await user.hover(grp);
    expect(screen.getByText("1 file")).toBeInTheDocument();
    // Both group rings pick it out in the middle, besides their legends.
    expect(screen.getAllByText("GRP")).toHaveLength(4);
    await user.unhover(grp);
    expect(screen.queryByText("1 file")).not.toBeInTheDocument();
  });

  it("does the same on keyboard focus", () => {
    chart();
    fireEvent.focus(screen.getByRole("button", { name: /^x265: 3 files/ }));
    expect(screen.getByText("3 files")).toBeInTheDocument();
  });

  it("lists a piece's files on click, Enter, or a click in the legend", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    chart({ onSelect });
    await user.click(screen.getByRole("button", { name: /^GRP: 1 file/ }));
    fireEvent.keyDown(screen.getByRole("button", { name: /^4K: 1 file/ }), { key: "Enter" });
    await user.click(screen.getAllByRole("button", { name: /^x264/ }).find((b) => b.tagName === "BUTTON")!);
    expect(onSelect.mock.calls.map(([s]) => [s.dimension, s.values])).toEqual([
      ["groups", ["GRP"]],
      ["resolutions", ["4K"]],
      ["codecs", ["x264"]],
    ]);
  });

  it("picks out the pieces whose files are listed", () => {
    chart({ filters: { ...noListFilters(), groups: new Set(["GRP"]), codecs: new Set(["x264"]) } });
    // The files ring by group and the codec ring, without hovering.
    expect(screen.getAllByText("1 file")).toHaveLength(2);
  });

  it("steps through the charts one at a time with the arrows", async () => {
    const user = userEvent.setup();
    chart();
    // No layout in the test: a track 600 wide over 1500 of cards 294 wide.
    const track = screen.getByText("Files by group").closest("figure")!.parentElement!.parentElement!;
    Object.defineProperties(track, {
      clientWidth: { value: 600 },
      scrollWidth: { value: 1500 },
      scrollLeft: { value: 0, writable: true },
    });
    for (const card of track.children) vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ width: 294 } as DOMRect);
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy;
    fireEvent.scroll(track);

    expect(screen.getByRole("button", { name: "Previous charts" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "More charts" }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 294, behavior: "smooth" });
  });

  it("draws nothing without files", () => {
    const { container } = render(
      <ShareChart stats={{ ...movies, files: 0, size: 0, groups: [], resolutions: [], codecs: [], languages: [] }} filters={noListFilters()} onSelect={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
