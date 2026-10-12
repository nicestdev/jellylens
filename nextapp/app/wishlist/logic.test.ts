import { describe, expect, it } from "vitest";
import type { RequestItem } from "@/lib/api-types";
import { ofTypes, sortWishlist, sortsFor } from "./logic";

const item = (title: string, requestedAt: string, requesters?: string[]): RequestItem =>
  ({
    mediaType: "movie",
    tmdbId: title.length,
    title,
    year: null,
    releaseDate: null,
    posterPath: null,
    requestedAt,
    mine: true,
    library: null,
    availability: null,
    requesters: requesters?.map((at, i) => ({ name: `u${i}`, requestedAt: at })),
  }) as unknown as RequestItem;

const titles = (items: RequestItem[]) => items.map((r) => r.title);

describe("sortWishlist", () => {
  const heat = item("Heat", "2026-10-01", ["2026-10-01", "2026-10-03"]);
  const alien = item("Alien", "2026-10-02", ["2026-10-02"]);
  const dune = item("dune", "2026-10-04", ["2026-10-04"]);

  it("puts the most wanted first, then the latest asked for", () => {
    expect(titles(sortWishlist([alien, dune, heat], "wanted", "desc"))).toEqual(["Heat", "dune", "Alien"]);
  });

  it("sorts by the latest request and by title, either way", () => {
    expect(titles(sortWishlist([alien, dune, heat], "added", "desc"))).toEqual(["dune", "Heat", "Alien"]);
    expect(titles(sortWishlist([alien, dune, heat], "added", "asc"))).toEqual(["Alien", "Heat", "dune"]);
    expect(titles(sortWishlist([heat, dune, alien], "title", "asc"))).toEqual(["Alien", "dune", "Heat"]);
    expect(titles(sortWishlist([heat, dune, alien], "title", "desc"))).toEqual(["Heat", "dune", "Alien"]);
  });

  it("uses a user's own request date without requesters", () => {
    const a = item("A", "2026-10-01");
    const b = item("B", "2026-10-05");
    expect(titles(sortWishlist([a, b], "added", "desc"))).toEqual(["B", "A"]);
  });
});

describe("ofTypes", () => {
  it("keeps the picked types, or everything when none is picked", () => {
    const movie = { mediaType: "movie" as const };
    const show = { mediaType: "tv" as const };
    expect([movie, show].filter(ofTypes(new Set()))).toEqual([movie, show]);
    expect([movie, show].filter(ofTypes(new Set(["tv"])))).toEqual([show]);
  });
});

describe("sortsFor", () => {
  it("offers Wanted only on the overview", () => {
    expect(sortsFor(true).map((s) => s.key)).toEqual(["wanted", "added", "title"]);
    expect(sortsFor(false).map((s) => s.key)).toEqual(["added", "title"]);
  });
});
