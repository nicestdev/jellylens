// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import type { Alternative, Unit, UpgradesResponse } from "@/lib/api-types";
import { SwitchView } from "./switch-view";

const GB = 1024 ** 3;

const alt = (group: string, over: Partial<Alternative> = {}): Alternative => ({
  group,
  tier: "1080p",
  codec: "x264",
  name: `Heat.1995.German.DL.1080p.BluRay.x264-${group}`,
  size: 9 * GB,
  audio: "DL",
  pack: false,
  episodes: 1,
  publishedAt: 100,
  ...over,
});

const unit = (key: string, title: string, group: string, alternatives: Alternative[]): Unit => ({
  key,
  parentId: key,
  title,
  year: 1995,
  tmdbId: 949,
  posterPath: null,
  season: null,
  fileName: `${title}.1995.German.1080p.BluRay.x264-${group}.mkv`,
  files: 1,
  size: 8 * GB,
  groups: [{ name: group, files: 1 }],
  tier: "1080p",
  codec: "x264",
  languages: ["DE"],
  alternatives,
});

const data: UpgradesResponse = {
  units: [
    unit("m1", "Heat", "w00t", [alt("VECTOR"), alt("FuN", { size: 5 * GB })]),
    unit("m2", "Alien", "w00t", [
      alt("VECTOR", { codec: "x265", name: "Alien.1979.German.DL.1080p.BluRay.x265-VECTOR" }),
    ]),
    unit("m3", "Brazil", "VECTOR", [alt("FuN")]),
  ],
  groups: [
    { value: "w00t", files: 2, size: 16 * GB },
    { value: "VECTOR", files: 1, size: 8 * GB },
  ],
  favorites: ["VECTOR", "FuN"],
  sizesPending: false,
  syncedAt: null,
};

const tile = (label: string) => screen.getByText(label).parentElement!;
const listed = () => screen.queryAllByRole("button", { name: /^(Heat|Alien|Brazil)$/ }).map((b) => b.textContent);

beforeEach(() => localStorage.clear());

describe("SwitchView", () => {
  it("starts with the first target A→Z, listing what it has and adding it up", () => {
    render(<SwitchView library="movies" data={data} onOpen={() => {}} />);
    expect(within(tile("FuN has")).getByText("2")).toBeInTheDocument();
    expect(within(tile("Storage")).getByText("−2.00 GB")).not.toHaveClass("text-success");
    expect(listed()).toEqual(["Brazil", "Heat"]);
  });

  it("switches the target in the filter, remembering it for next time", async () => {
    const { unmount } = render(<SwitchView library="movies" data={data} onOpen={() => {}} />);
    // The target's own button names the pick.
    await userEvent.click(screen.getByRole("button", { name: "Target: FuN" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /VECTOR/ }));
    await userEvent.keyboard("{Escape}");
    expect(within(tile("VECTOR has")).getByText("2")).toBeInTheDocument();
    expect(listed()).toEqual(["Alien", "Heat"]);
    expect(JSON.parse(localStorage.getItem("jellylens.upgrades.movies")!)).toEqual({
      target: "VECTOR",
      quality: "same",
      codec: "any",
    });

    unmount();
    render(<SwitchView library="movies" data={data} onOpen={() => {}} />);
    expect(screen.getByText("VECTOR has")).toBeInTheDocument();
  });

  it("narrows it by codec, with a chip that takes it back", async () => {
    localStorage.setItem("jellylens.upgrades.movies", JSON.stringify({ target: "VECTOR", codec: "x265" }));
    render(<SwitchView library="movies" data={data} onOpen={() => {}} />);
    expect(listed()).toEqual(["Alien"]);
    await userEvent.click(screen.getByRole("button", { name: "x265" }));
    expect(listed()).toEqual(["Alien", "Heat"]);
  });

  it("searches the titles, and says when nothing's left", async () => {
    render(<SwitchView library="movies" data={data} onOpen={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText("Search titles…"), "bra");
    expect(listed()).toEqual(["Brazil"]);
    await userEvent.type(screen.getByPlaceholderText("Search titles…"), "zzz");
    expect(screen.getByText("Nothing from FuN")).toBeInTheDocument();
  });

  it("shows each row as the file you have, greyed, over the release, both without the title", () => {
    localStorage.setItem("jellylens.upgrades.movies", JSON.stringify({ target: "FuN", quality: "any" }));
    const name = "Ronin.1998.German.DL.720p.BluRay.x264-FuN";
    const units = [unit("m4", "Ronin", "w00t", [alt("FuN", { tier: "720p", size: 4 * GB, name })])];
    render(<SwitchView library="movies" data={{ ...data, units }} onOpen={() => {}} />);
    const row = screen.getByRole("button", { name: "Ronin" }).closest("tr")!;
    const now = within(row).getByText("German.1080p.BluRay.x264-w00t");
    expect(now).toHaveClass("text-muted-foreground/50");
    expect(now).toHaveAttribute("title", "Ronin.1995.German.1080p.BluRay.x264-w00t.mkv");
    expect(within(row).getByTitle(name)).toHaveTextContent(/^German\.DL\.720p\.BluRay\.x264-FuN$/);
    // Then the release's group, quality, codec and audio, what you have on hover.
    expect(
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual([expect.any(String), "FuN", "720p", "x264", "DL", "4.00\u202fGB", expect.any(String)]);
    expect(within(row).getByTitle("Now w00t")).toHaveTextContent("FuN");
    expect(within(row).getByTitle("Now 1080p")).toHaveTextContent("720p");
  });

  it("colors what changes in the release's name, the columns plain: for another group, red for worse, green for better", async () => {
    localStorage.setItem("jellylens.upgrades.movies", JSON.stringify({ target: "FuN", quality: "any" }));
    const name = "Ronin.1998.German.DL.720p.BluRay.x264-FuN";
    const units = [unit("m4", "Ronin", "w00t", [alt("FuN", { tier: "720p", size: 4 * GB, name })])];
    const { unmount } = render(<SwitchView library="movies" data={{ ...data, units }} onOpen={() => {}} />);
    const ronin = screen.getByRole("button", { name: "Ronin" }).closest("tr")!;
    const releaseName = within(within(ronin).getByTitle(name));
    expect(releaseName.getByText("FuN")).toHaveClass("text-foreground");
    expect(releaseName.getByText("720p")).toHaveClass("text-destructive");
    expect(releaseName.getByText("DL")).toHaveClass("text-success");
    // The columns stay plain.
    expect(within(ronin).getByTitle("Now 1080p")).not.toHaveClass("text-destructive");
    unmount();
    localStorage.clear();

    render(<SwitchView library="movies" data={data} onOpen={() => {}} />);
    const heat = screen.getByRole("button", { name: "Heat" }).closest("tr")!;
    // The same codec and quality aren't marked: plain in the name, muted in the column.
    expect(within(heat).getAllByText("x264")).toHaveLength(1);
    expect(within(heat).getByText("x264")).toHaveClass("text-muted-foreground");
    expect(within(heat).getByText("5.00 GB")).toHaveAttribute("title", "Now 8.00\u202fGB");
    expect(within(heat).getByText("−3.00 GB")).toHaveClass("text-success");

    await userEvent.click(screen.getByRole("button", { name: "Target: FuN" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /VECTOR/ }));
    await userEvent.keyboard("{Escape}");
    const alien = screen.getByRole("button", { name: "Alien" }).closest("tr")!;
    const [inName, inColumn] = within(alien).getAllByText("x265");
    expect(inName).toHaveClass("text-success");
    expect(inColumn).not.toHaveClass("text-success");
    expect(within(alien).getByText("+1.00 GB")).toHaveClass("text-destructive");
  });

  it("puts quality, codec and audio in one Format menu, counting what's off its default", async () => {
    render(<SwitchView library="movies" data={data} onOpen={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Format" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "x265" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Adds original audio" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Format 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "x265" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Original audio" })).toBeInTheDocument();
  });

  it("opens a title's page on the target's releases", async () => {
    const onOpen = vi.fn();
    render(<SwitchView library="movies" data={data} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "Heat" }));
    expect(onOpen).toHaveBeenCalledWith(expect.stringMatching(/^\/title\/movie\/949\?group=FuN&tier=1080p/));
  });
});
