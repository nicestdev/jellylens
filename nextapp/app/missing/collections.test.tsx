// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import type { CollectionItem, CollectionPartItem, ReleaseDetail, RequestItem } from "@/lib/api-types";
import { CollectionList } from "./collections";

const part = (tmdbId: number, title: string, over: Partial<CollectionPartItem> = {}): CollectionPartItem => ({
  tmdbId,
  title,
  releaseDate: "2026-03-01",
  posterPath: null,
  owned: false,
  releaseGroups: [],
  ...over,
});

const heat = part(949, "Heat", { releaseDate: "1995-12-15", owned: true, fileName: "Heat.1995.1080p.x265-FuN.mkv" });
const heat2 = part(2, "Heat 2", { releaseGroups: ["FuN", "VECTOR"] });
const heat3 = part(3, "Heat 3");
const collection: CollectionItem = { id: "c1", name: "Heat Collection", posterPath: null, count: 2, parts: [heat, heat2, heat3] };

const detail: ReleaseDetail = {
  key: "movie:2",
  titles: [
    {
      titleKey: "heat2",
      label: "Heat 2 (2026)",
      match: { status: "verified", shown: { title: "Heat 2", year: 2026, posterPath: null, mediaType: "movie", tmdbId: 2 }, verdict: null, candidate: null },
      Items: [
        { id: "r1", name: "Heat.2.2026.German.DL.2160p.WEB.x265-FuN", link: "https://www.xrel.to/r1", quality: "HD-2160p", publishedAt: 1790000000, group: "FuN" },
      ],
    },
  ],
};

// /api/requests (empty until something is requested) and the panel's
// /api/releases/<key>.
function api() {
  let requests: RequestItem[] = [];
  return mockFetch((url, init) => {
    if (url.pathname === "/api/requests") {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        requests = [{ ...body, requestedAt: "2026-10-01T00:00:00Z", mine: true, library: null, availability: null, releaseGroups: [] }];
      }
      return json({ Items: requests, all: true, admin: true });
    }
    if (url.pathname === "/api/releases/" + encodeURIComponent("movie:2")) return json(detail);
  });
}

const list = (over: { onIgnore?: () => void; onReleasesChanged?: () => void } = {}) =>
  render(
    <CollectionList
      groups={[{ collection, parts: [heat2, heat3] }]}
      onIgnore={over.onIgnore ?? (() => {})}
      onReleasesChanged={over.onReleasesChanged ?? (() => {})}
    />
  );

describe("CollectionList", () => {
  it("shows a collection with what you own of it and the files you have", () => {
    api();
    list();
    // TMDB's "Collection" suffix is dropped.
    expect(screen.getByRole("link", { name: "Heat" })).toHaveAttribute("href", "https://www.themoviedb.org/collection/c1");
    expect(screen.getByText("1 of 3 owned")).toBeInTheDocument();
    expect(screen.getByText(/Heat\.1995\.1080p/)).toBeInTheDocument();
  });

  it("names the groups that released a missing movie in one badge, which opens its releases", async () => {
    api();
    list();
    expect(screen.getByText("FuN +1")).toHaveAttribute("title", "Released by FuN, VECTOR");
    // Neither the owned movie nor one nobody released has a badge.
    expect(screen.queryByRole("button", { name: "Show releases of Heat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show releases of Heat 3" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Show releases of Heat 2" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Heat 2")).toBeInTheDocument();
    expect(await within(panel).findByText(/Heat\.2\.2026\.German\.DL/)).toBeInTheDocument();
    expect(within(panel).getByText("2026 · 1 release")).toBeInTheDocument();
  });

  it("requests a missing movie, then marks it requested", async () => {
    const fetch = api();
    list();
    await userEvent.click(await screen.findByRole("button", { name: "Request Heat 2" }));
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ mediaType: "movie", tmdbId: 2, title: "Heat 2", year: 2026 });
    expect(await screen.findByRole("button", { name: "Requested" })).toBeDisabled();
  });

  it("ignores one missing movie or the whole collection", async () => {
    api();
    const onIgnore = vi.fn();
    list({ onIgnore });
    await userEvent.click(screen.getByRole("button", { name: "More options for Heat" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ignore Heat 2" }));
    await userEvent.click(screen.getByRole("button", { name: "More options for Heat" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ignore entire collection" }));
    expect(onIgnore.mock.calls.map(([e]) => e)).toEqual([
      { kind: "collection", collectionId: "c1", movieId: 2 },
      { kind: "collection", collectionId: "c1", movieId: null },
    ]);
  });
});
