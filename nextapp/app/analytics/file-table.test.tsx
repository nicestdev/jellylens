// @vitest-environment happy-dom
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import type { FileListRow } from "@/lib/api-types";
import { FileTable } from "./file-table";
import { fileFacets, noListFilters, type Library, type ListFilters } from "./logic";

const row = (i: number, over: Partial<FileListRow> = {}): FileListRow => ({
  key: `m${i}:0`,
  title: `Movie ${i}`,
  year: 2000,
  tmdbId: String(i),
  season: null,
  episode: null,
  episodeEnd: null,
  episodeTitle: null,
  fileName: `Movie.${i}.1080p-FuN.mkv`,
  group: "FuN",
  size: 1024 ** 3,
  resolution: "1080p",
  codec: "x265",
  languages: ["DE"],
  ...over,
});

// The server: 61 files, 50 to a page; "Heat" by GRP. Answers what's asked
// and records it.
function server() {
  const all = [...Array.from({ length: 60 }, (_, i) => row(i + 1)), row(61, { title: "Heat", group: "GRP" })];
  return mockFetch((url) => {
    if (url.pathname !== "/api/analytics/files") return;
    const q = url.searchParams.get("q") ?? "";
    const groups = url.searchParams.getAll("group");
    const matching = all.filter((f) => f.title.toLowerCase().includes(q) && (!groups.length || groups.includes(f.group ?? "")));
    const offset = Number(url.searchParams.get("offset"));
    return json({ matched: matching.length, pageSize: 50, Items: matching.slice(offset, offset + 50) });
  });
}

const facets = fileFacets({
  titles: 61,
  withFiles: 61,
  files: 61,
  size: 61,
  pending: false,
  groups: [
    { value: "FuN", files: 60, size: 60 },
    { value: "GRP", files: 1, size: 1 },
  ],
  resolutions: [],
  codecs: [],
  languages: [],
});

// The page holds the filters; this stands in for it.
function Page({ groups = new Set<string>(), library = "movies" }: { groups?: Set<string>; library?: Library }) {
  const [filters, setFilters] = useState<ListFilters>(() => ({ ...noListFilters(), groups }));
  return (
    <FileTable
      library={library}
      facets={facets}
      filters={filters}
      onFilter={(dimension, values) => setFilters((prev) => ({ ...prev, [dimension]: values }))}
    />
  );
}

const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

describe("FileTable", () => {
  it("shows the server's pages", async () => {
    const user = userEvent.setup();
    server();
    render(<Page />);
    expect(await screen.findByText("1–50 of 61 files")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(50);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("51–61 of 61 files")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("asks again from the first page when the search changes", async () => {
    const user = userEvent.setup();
    const fetch = server();
    render(<Page />);
    await screen.findByText("1–50 of 61 files");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("51–61 of 61 files");
    await user.type(screen.getByPlaceholderText("Search titles and files…"), "movie 1");
    expect(await screen.findByText("1–11 of 11 files")).toBeInTheDocument();
    // Typing is waited out: one request for the search, not one per key.
    const searches = fetch.mock.calls.map(([u]) => new URL(String(u), "http://x").searchParams.get("q"));
    expect(searches.filter((q) => q?.startsWith("movie"))).toEqual(["movie 1"]);
  });

  it("shows an episode with its show, number and title, and n/a for no group", async () => {
    mockFetch((url) => {
      if (url.searchParams.get("library") !== "shows") return;
      const silo = row(1, { title: "Silo", year: 2023, tmdbId: "125988", season: 1, episode: 2, episodeTitle: "Holston", group: null });
      return json({ matched: 1, pageSize: 50, Items: [silo] });
    });
    render(<Page library="shows" />);
    expect(await screen.findByRole("link", { name: "Silo" })).toHaveAttribute("href", "https://www.themoviedb.org/tv/125988");
    const [cells] = bodyRows().map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(cells.slice(0, 2)).toEqual(["SiloS01E02 · HolstonMovie.1.1080p-FuN.mkv", "n/a"]);
    expect(screen.getByPlaceholderText("Search shows, episodes and files…")).toBeInTheDocument();
  });

  it("lists the filters it's given as chips, removable", async () => {
    const user = userEvent.setup();
    server();
    render(<Page groups={new Set(["GRP"])} />);
    expect(await screen.findByRole("link", { name: "Heat" })).toHaveAttribute("href", "https://www.themoviedb.org/movie/61");
    expect(bodyRows()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "GRP" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(50));
  });
});
