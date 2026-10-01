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
  imageTag: null,
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
    unit("m2", "Alien", "w00t", [alt("VECTOR", { codec: "x265" })]),
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
const listed = () =>
  screen
    .queryAllByRole("button", { name: /^(Heat|Alien|Brazil)$/ })
    .map((b) => b.textContent);

beforeEach(() => localStorage.clear());

describe("SwitchView", () => {
  it("starts with the first target A→Z, listing what it has and adding it up", () => {
    render(<SwitchView library="movies" data={data} onOpen={() => {}} />);
    expect(within(tile("FuN has")).getByText("2")).toBeInTheDocument();
    expect(within(tile("Storage")).getByText("−2,00 GB")).toHaveClass("text-emerald-400");
    expect(listed()).toEqual(["Brazil", "Heat"]);
  });

  it("switches the target in the filter, remembering it for next time", async () => {
    const { unmount } = render(<SwitchView library="movies" data={data} onOpen={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Filter/ }));
    // VECTOR is a source too; the target section comes first.
    await userEvent.click(screen.getAllByRole("menuitemcheckbox", { name: /VECTOR/ })[0]);
    await userEvent.keyboard("{Escape}");
    expect(within(tile("VECTOR has")).getByText("2")).toBeInTheDocument();
    expect(listed()).toEqual(["Alien", "Heat"]);
    expect(JSON.parse(localStorage.getItem("jellylens.upgrades.movies")!)).toEqual({ target: "VECTOR", quality: "same", codec: "any" });

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

  it("opens a title's panel on the target's releases", async () => {
    const onOpen = vi.fn();
    render(<SwitchView library="movies" data={data} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "Heat" }));
    expect(onOpen.mock.calls[0][0]).toMatchObject({ title: { key: "movie:949", title: "Heat" }, only: { note: "Only FuN's 1080p releases" } });
  });
});
