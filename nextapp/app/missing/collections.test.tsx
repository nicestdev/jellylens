// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import type { CollectionItem, CollectionPartItem, RequestItem } from "@/lib/api-types";
import { CollectionList, IgnoredCollections } from "./collections";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const part = (tmdbId: number, title: string, over: Partial<CollectionPartItem> = {}): CollectionPartItem => ({
  tmdbId,
  title,
  releaseDate: "2026-03-01",
  posterPath: null,
  owned: false,
  releaseGroups: [],
  ...over,
});

const heat = part(949, "Heat", { releaseDate: "1995-12-15", owned: true });
const heat2 = part(2, "Heat 2", { releaseGroups: ["FuN", "VECTOR"] });
const heat3 = part(3, "Heat 3");
const collection: CollectionItem = {
  id: "c1",
  name: "Heat Collection",
  posterPath: null,
  count: 2,
  parts: [heat, heat2, heat3],
};

// /api/requests (empty until something is requested).
function api() {
  let requests: RequestItem[] = [];
  return mockFetch((url, init) => {
    if (url.pathname === "/api/requests") {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        requests = [
          {
            ...body,
            requestedAt: "2026-10-01T00:00:00Z",
            mine: true,
            library: null,
            availability: null,
            releaseGroups: [],
          },
        ];
      }
      return json({ Items: requests, all: true, admin: true });
    }
  });
}

const list = (over: { onIgnore?: () => void; onReleasesChanged?: () => void } = {}) =>
  render(
    <CollectionList
      groups={[{ collection, parts: [heat2, heat3] }]}
      onIgnore={over.onIgnore ?? (() => {})}
      onReleasesChanged={over.onReleasesChanged ?? (() => {})}
    />,
  );

describe("CollectionList", () => {
  it("shows a collection with what you own of it", () => {
    api();
    list();
    // TMDB's "Collection" suffix is dropped.
    expect(screen.getByRole("link", { name: "Heat" })).toHaveAttribute(
      "href",
      "https://www.themoviedb.org/collection/c1",
    );
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("shows all its movies, grays out the one you have, and names who released a missing one", async () => {
    api();
    list();
    expect(screen.getAllByTitle(/^Heat( \d)?$/).map((b) => b.getAttribute("title"))).toEqual([
      "Heat",
      "Heat 2",
      "Heat 3",
    ]);
    expect(screen.getByTitle("Heat").closest(".grayscale")).not.toBeNull();
    expect(screen.getByTitle("Heat 2").closest(".grayscale")).toBeNull();
    expect(screen.getByText("FuN +1")).toHaveAttribute("title", "Released by FuN, VECTOR");
    // Neither the owned movie nor one nobody released has a badge.
    expect(screen.queryAllByTitle(/^Released by/)).toHaveLength(1);

    // A poster opens the title's page with its releases.
    await userEvent.click(screen.getByTitle("Heat 2"));
    expect(push).toHaveBeenCalledWith("/title/movie/2");
  });

  it("puts a missing movie on the wishlist, then marks it so", async () => {
    const fetch = api();
    list();
    // Only the missing ones have the + (owned Heat has none).
    expect(screen.getAllByRole("button", { name: "Add to wishlist" })).toHaveLength(2);
    await userEvent.click(screen.getAllByRole("button", { name: "Add to wishlist" })[0]);
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({
      mediaType: "movie",
      tmdbId: 2,
      title: "Heat 2",
      year: 2026,
    });
    expect(await screen.findByRole("button", { name: "Remove from wishlist" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores one missing movie or the whole collection", async () => {
    api();
    const onIgnore = vi.fn();
    list({ onIgnore });
    await userEvent.click(screen.getByRole("button", { name: "More options for Heat" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ignore Heat 2" }));
    await userEvent.click(screen.getByRole("button", { name: "More options for Heat" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ignore all of Heat" }));
    expect(onIgnore.mock.calls.map(([e]) => e)).toEqual([
      { kind: "collection", collectionId: "c1", movieId: 2 },
      { kind: "collection", collectionId: "c1", movieId: null },
    ]);
  });
});

describe("IgnoredCollections", () => {
  const entries = [
    { kind: "collection" as const, collectionId: "c1", movieId: 2 },
    { kind: "collection" as const, collectionId: "c1", movieId: null },
    { kind: "collection" as const, collectionId: "gone", movieId: null },
  ];
  const ignored = (query = "", onUnignore = vi.fn()) =>
    render(<IgnoredCollections entries={entries} collections={[collection]} query={query} onUnignore={onUnignore} />);

  it("shows an ignored movie with its collection, a whole collection marked All", async () => {
    const onUnignore = vi.fn();
    ignored("", onUnignore);
    // By collection name, the whole one before its movies.
    expect(screen.getAllByRole("button", { name: /^Unignore/ }).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Unignore Complete collection",
      "Unignore Heat",
      "Unignore Heat 2",
    ]);
    expect(screen.getAllByText("All")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Unignore Heat 2" }));
    expect(onUnignore).toHaveBeenCalledWith(entries[0]);
  });

  it("narrows by movie or collection name, and says when nothing is ignored", () => {
    const { unmount } = ignored("heat 2");
    expect(screen.getAllByRole("button", { name: /^Unignore/ })).toHaveLength(1);
    unmount();
    const { unmount: unmount2 } = ignored("nope");
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
    unmount2();
    render(<IgnoredCollections entries={[]} collections={[]} query="" onUnignore={vi.fn()} />);
    expect(screen.getByText("Nothing ignored")).toBeInTheDocument();
  });
});
