import { describe, expect, it } from "vitest";
import type { CollectionItem, IgnoreEntry, MissingSeason, ShowItem } from "@/lib/api-types";
import { show } from "@/test/fixtures";
import { cardHint, episodeRanges, lineText, linesFor, missingView, summary } from "./logic";

const season = (n: number, over: Partial<MissingSeason> = {}): MissingSeason => ({
  season: n,
  episodes: "1-2",
  wholeSeason: false,
  ended: true,
  count: 2,
  total: 10,
  episodeStates: [],
  ...over,
});

const item = (id: string, seasons: MissingSeason[], mismatches: ShowItem["Mismatches"] = null): ShowItem => ({
  ...show({ Id: id }),
  MissingEpisodes: seasons.length ? { count: seasons.reduce((s, x) => s + x.count, 0), seasons } : null,
  Mismatches: mismatches,
  Languages: null,
});

const collection = (id: string, parts: [number, boolean][]): CollectionItem => ({
  id,
  name: id,
  posterPath: null,
  count: parts.filter(([, owned]) => !owned).length,
  parts: parts.map(([tmdbId, owned]) => ({ tmdbId, title: `Part ${tmdbId}`, releaseDate: null, posterPath: null, owned, releaseGroups: [] })),
});

describe("linesFor", () => {
  it("splits seasons into gaps, whole seasons and seasons still airing", () => {
    const s = item("s", [season(4, { ended: false }), season(3, { wholeSeason: true }), season(2), season(1)]);
    expect(linesFor(s, "gaps").map((l) => l.season)).toEqual([1, 2]);
    expect(linesFor(s, "seasons").map((l) => l.season)).toEqual([3]);
    expect(linesFor(s, "airing").map((l) => [l.season, l.airing])).toEqual([[4, true]]);
  });

  it("lists mismatches by season, whole extra seasons included", () => {
    const lines = linesFor(item("s", [], { extraSeasons: [4], extraEpisodes: [{ season: 1, episodes: "9", count: 1 }] }), "mismatch");
    expect(lines.map((l) => [l.season, lineText(l)])).toEqual([[1, "E9"], [4, "Not on TMDB"]]);
  });
});

describe("episodeRanges", () => {
  it("prefixes every range with E and uses an en dash", () => {
    expect(episodeRanges("5-7, 9")).toBe("E5–7, E9");
  });
});

describe("missingView", () => {
  const shows = [
    item("a", [season(1, { count: 3 }), season(2, { count: 1, ended: false })]),
    item("b", [season(1, { count: 4 }), season(2, { count: 10, wholeSeason: true })], { extraSeasons: [5], extraEpisodes: [] }),
  ];
  const collections = [collection("c1", [[1, true], [2, false], [3, false]]), collection("c2", [[4, false]])];

  it("counts what's missing per category", () => {
    const view = missingView(shows, collections, []);
    expect(view.counts).toEqual({
      gaps: { count: 7, groups: 2 },
      seasons: { count: 10, groups: 1 },
      airing: { count: 1, groups: 1 },
      movies: { count: 3, groups: 2 },
      mismatch: { count: 1, groups: 1 },
    });
    expect(summary(view.counts)).toBe("18 episodes and 3 movies");
  });

  it("leaves out ignored seasons, shows, parts and collections", () => {
    const ignored: IgnoreEntry[] = [
      { kind: "missing", seriesId: "a", season: 1 },
      { kind: "missing", seriesId: "b", season: null },
      { kind: "mismatch", seriesId: "b", season: 5 },
      { kind: "collection", collectionId: "c1", movieId: 2 },
      { kind: "collection", collectionId: "c2", movieId: null },
    ];
    const view = missingView(shows, collections, ignored);
    expect(view.showGroups.gaps).toEqual([]);
    expect(view.showGroups.seasons).toEqual([]);
    expect(view.showGroups.airing.map((g) => [g.item.Id, g.lines.map((l) => l.season)])).toEqual([["a", [2]]]);
    expect(view.showGroups.mismatch).toEqual([]);
    expect(view.collectionGroups.map((g) => [g.collection.id, g.parts.map((p) => p.tmdbId)])).toEqual([["c1", [3]]]);
    expect(view.showIgnored).toHaveLength(3);
    expect(view.collectionIgnored).toHaveLength(2);
  });

  it("says Nothing when nothing is missing", () => {
    expect(summary(missingView([], [], []).counts)).toBe("Nothing");
  });
});

describe("cardHint", () => {
  it("names what a card counts and where, or says there's nothing", () => {
    expect(cardHint(12, 3, "episode", "show")).toBe("episodes in 3 shows");
    expect(cardHint(1, 1, "movie", "collection")).toBe("movie in 1 collection");
    expect(cardHint(0, 0, "issue", "show")).toBe("nothing to do");
  });
});
