// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import { mockIntersection } from "@/test/intersection";
import type { FileListRow } from "@/lib/api-types";
import { FileTable } from "./file-table";

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

// The server: 61 files, 50 to a page, the last one "Heat". Answers what's
// asked and records it.
function server() {
  const all = [...Array.from({ length: 60 }, (_, i) => row(i + 1)), row(61, { title: "Heat" })];
  return mockFetch((url) => {
    if (url.pathname !== "/api/analytics/files") return;
    const q = url.searchParams.get("q") ?? "";
    const matching = all.filter((f) => f.title.toLowerCase().includes(q));
    if (url.searchParams.get("dir") === "desc") matching.reverse();
    const offset = Number(url.searchParams.get("offset"));
    return json({ matched: matching.length, pageSize: 50, Items: matching.slice(offset, offset + 50) });
  });
}

const asked = (fetch: ReturnType<typeof server>) =>
  fetch.mock.calls.map(([u]) => new URL(String(u), "http://x").searchParams);

const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

describe("FileTable", () => {
  it("loads the server's next page when scrolled to the end", async () => {
    const view = mockIntersection();
    const fetch = server();
    render(<FileTable library="movies" />);
    expect(await screen.findByText("1–50 of 61 files")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(50);
    act(() => view.scrollToEnd());
    expect(await screen.findByText("1–61 of 61 files")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(61);
    // All there: scrolling on asks nothing more.
    const asked = fetch.mock.calls.length;
    act(() => view.scrollToEnd());
    expect(fetch).toHaveBeenCalledTimes(asked);
  });

  it("starts from the first page again when the search changes", async () => {
    const user = userEvent.setup();
    const view = mockIntersection();
    const fetch = server();
    render(<FileTable library="movies" />);
    await screen.findByText("1–50 of 61 files");
    act(() => view.scrollToEnd());
    await screen.findByText("1–61 of 61 files");
    await user.type(screen.getByPlaceholderText("Search titles and files…"), "movie 1");
    expect(await screen.findByText("1–11 of 11 files")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(11);
    // Typing is waited out: one request for the search, not one per key.
    const searches = asked(fetch).map((p) => p.get("q"));
    expect(searches.filter((q) => q?.startsWith("movie"))).toEqual(["movie 1"]);
  });

  it("shows an episode with its show, number and title, its file name, group, quality, codec, audio and size", async () => {
    mockFetch((url) => {
      if (url.searchParams.get("library") !== "shows") return;
      const silo = row(1, {
        title: "Silo",
        year: 2023,
        tmdbId: "125988",
        season: 1,
        episode: 2,
        episodeTitle: "Holston",
        group: null,
      });
      return json({ matched: 1, pageSize: 50, Items: [silo] });
    });
    render(<FileTable library="shows" />);
    expect(await screen.findByRole("link", { name: "Silo" })).toHaveAttribute(
      "href",
      "https://www.themoviedb.org/tv/125988",
    );
    const [cells] = bodyRows().map((r) =>
      within(r)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    );
    expect(cells).toEqual(["SiloS01E02 · HolstonMovie.1.1080p-FuN.mkv", "—", "1080p", "x265", "DE", "1.00\u202fGB"]);
    expect(screen.getByPlaceholderText("Search shows, episodes and files…")).toBeInTheDocument();
  });

  it("asks for the other direction, from the first page, when the sort flips", async () => {
    const user = userEvent.setup();
    const fetch = server();
    render(<FileTable library="movies" />);
    await screen.findByText("1–50 of 61 files");
    await user.click(screen.getByRole("button", { name: "Sort descending" }));
    expect(await screen.findByRole("link", { name: "Heat" })).toHaveAttribute(
      "href",
      "https://www.themoviedb.org/movie/61",
    );
    expect(bodyRows()[0]).toHaveTextContent("Heat");
    const last = asked(fetch).at(-1)!;
    expect([last.get("sort"), last.get("dir"), last.get("offset")]).toEqual(["title", "desc", "0"]);
  });

  it("loads again after a sync", async () => {
    const fetch = server();
    const { rerender } = render(<FileTable library="movies" version="a" />);
    await screen.findByText("1–50 of 61 files");
    const before = fetch.mock.calls.length;
    rerender(<FileTable library="movies" version="b" />);
    await waitFor(() => expect(fetch.mock.calls.length).toBe(before + 1));
  });
});
