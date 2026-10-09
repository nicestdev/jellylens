// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import type { LibraryAnalytics } from "@/lib/api-types";
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

const chart = () => render(<ShareChart stats={movies} />);

describe("ShareChart", () => {
  it("has a ring each for files and storage by group, and files by resolution and codec", () => {
    chart();
    expect(screen.getByLabelText("FuN: 3 files, 75,0 % of files by group")).toBeInTheDocument();
    expect(screen.getByLabelText("GRP: 3,00 GB, 75,0 % of storage by group")).toBeInTheDocument();
    // A legend per ring, with that ring's share.
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "FuN75,0 %",
      "GRP25,0 %",
      "FuN25,0 %",
      "GRP75,0 %",
      // Languages out of every file, so they can add up to more.
      "German100,0 %",
      "English25,0 %",
      // Resolutions and codecs with the most files first.
      "1080p75,0 %",
      "4K25,0 %",
      "x26575,0 %",
      "x26425,0 %",
    ]);
    // Each entry's value is its tooltip.
    expect(screen.getByTitle("3,00 GB")).toHaveTextContent("GRP75,0 %");
  });

  it("has a ring per audio language, out of every file", () => {
    chart();
    expect(screen.getByLabelText("German: 4 files, 100,0 % of all files")).toBeInTheDocument();
    expect(screen.getByLabelText("English: 1 file, 25,0 % of all files")).toBeInTheDocument();
  });

  it("shows the totals in the middle, or the piece under the pointer", async () => {
    const user = userEvent.setup();
    chart();
    // Storage as its number over its unit.
    expect(screen.getByText("4,00")).toBeInTheDocument();
    expect(screen.getByText("GB")).toBeInTheDocument();
    expect(screen.getAllByText("files")).toHaveLength(3);

    const grp = screen.getByLabelText(/^GRP: 1 file/);
    await user.hover(grp);
    expect(screen.getByText("1 file")).toBeInTheDocument();
    // Both group rings pick it out in the middle, besides their legends.
    expect(screen.getAllByText("GRP")).toHaveLength(4);
    await user.unhover(grp);
    expect(screen.queryByText("1 file")).not.toBeInTheDocument();
  });

  it("does the same on keyboard focus", () => {
    chart();
    const x265 = screen.getByLabelText(/^x265: 3 files/);
    fireEvent.focus(x265);
    expect(screen.getByText("3 files")).toBeInTheDocument();
    fireEvent.blur(x265);
    expect(screen.queryByText("3 files")).not.toBeInTheDocument();
  });

  it("picks out a piece on a tap in the legend, for touch screens", () => {
    chart();
    fireEvent.click(screen.getByRole("button", { name: /^4K/ }));
    expect(screen.getByText("1 file")).toBeInTheDocument();
    expect(screen.getAllByText("4K")).toHaveLength(2);
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
    for (const card of track.children)
      vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ width: 294 } as DOMRect);
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy;
    fireEvent.scroll(track);

    expect(screen.getByRole("button", { name: "Previous charts" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "More charts" }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 294, behavior: "smooth" });
  });

  it("draws nothing without files", () => {
    const { container } = render(
      <ShareChart stats={{ ...movies, files: 0, size: 0, groups: [], resolutions: [], codecs: [], languages: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
