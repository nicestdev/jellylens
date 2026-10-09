import { describe, expect, it } from "vitest";
import { episode, movie } from "@/test/fixtures";
import { computeMissing, diffSeries, formatEpisodeRanges, missingCollections, ownedEpisodes } from "./compute-missing";
import {
  getMismatches,
  getMissingCollections,
  getMissingSeries,
  replaceJellyfin,
  replaceTmdb,
  syncedAt,
  type TmdbCollection,
} from "./store";

const ep = episode;

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("formatEpisodeRanges", () => {
  it("joins runs into ranges", () => {
    expect(formatEpisodeRanges([1, 3, 4, 5, 7, 9, 10])).toBe("1, 3-5, 7, 9-10");
    expect(formatEpisodeRanges([])).toBe("");
  });
});

describe("ownedEpisodes", () => {
  it("counts every episode of a combined file", () => {
    const owned = ownedEpisodes([ep("s", 2, 1, 2), ep("s", 2, 4)]);
    expect([...owned.get("s")!.get(2)!]).toEqual([1, 2, 4]);
  });

  it("skips episodes without a season or number", () => {
    const owned = ownedEpisodes([
      { ...ep("s", 1, 1), ParentIndexNumber: null },
      { ...ep("s", 1, 2), IndexNumber: null },
    ]);
    expect(owned.size).toBe(0);
  });
});

describe("diffSeries", () => {
  const tmdb = (seasons: { season: number; aired: number[]; all?: number[] }[]) => ({
    s: {
      tmdbId: "1",
      seasons: seasons.map((x) => ({
        season: x.season,
        airedEpisodeNumbers: x.aired,
        episodeNumbers: x.all ?? x.aired,
      })),
    },
  });

  it("lists aired episodes that aren't owned", () => {
    const { missing } = diffSeries(
      tmdb([{ season: 1, aired: range(1, 6) }]),
      ownedEpisodes([1, 2, 4].map((n) => ep("s", 1, n))),
    );
    expect(missing.s).toMatchObject({
      count: 3,
      seasons: [{ season: 1, episodes: "3, 5-6", wholeSeason: false, ended: true, total: 6 }],
    });
  });

  it("marks a season with nothing owned as whole, and one still airing as not ended", () => {
    const { missing } = diffSeries(
      tmdb([
        { season: 1, aired: range(1, 3) },
        { season: 2, aired: [1, 2], all: range(1, 4) },
      ]),
      ownedEpisodes(
        range(1, 3)
          .map((n) => ep("s", 1, n))
          .concat(ep("s", 2, 1)),
      ),
    );
    expect(missing.s.seasons).toEqual([
      expect.objectContaining({ season: 2, episodes: "2", ended: false, wholeSeason: false }),
    ]);
    expect(missing.s.seasons[0].episodeStates.map((e) => e.state)).toEqual([
      "owned",
      "missing",
      "upcoming",
      "upcoming",
    ]);

    const none = diffSeries(tmdb([{ season: 1, aired: [1, 2] }]), new Map());
    expect(none.missing.s.seasons[0].wholeSeason).toBe(true);
  });

  it("leaves complete shows out", () => {
    const { missing, mismatches } = diffSeries(
      tmdb([{ season: 1, aired: [1, 2] }]),
      ownedEpisodes([ep("s", 1, 1), ep("s", 1, 2)]),
    );
    expect(missing).toEqual({});
    expect(mismatches).toEqual({});
  });

  it("flags owned episodes and seasons TMDB doesn't know, but not specials", () => {
    const { mismatches } = diffSeries(
      tmdb([{ season: 1, aired: [1, 2] }]),
      ownedEpisodes([ep("s", 1, 1), ep("s", 1, 2), ep("s", 1, 7), ep("s", 1, 8), ep("s", 3, 1), ep("s", 0, 1)]),
    );
    expect(mismatches.s).toEqual({ extraSeasons: [3], extraEpisodes: [{ season: 1, episodes: "7-8", count: 2 }] });
  });
});

describe("missingCollections", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const collection = (parts: TmdbCollection["parts"]): Record<string, TmdbCollection> => ({
    c: { name: "C", posterPath: null, parts },
  });
  const part = (
    tmdbId: number,
    releaseDate: string | null,
    releases?: TmdbCollection["parts"][number]["releases"],
  ) => ({
    tmdbId,
    title: `Part ${tmdbId}`,
    releaseDate,
    posterPath: null,
    releases,
  });

  it("keeps owned parts and ones out on disc or digital", () => {
    const result = missingCollections(
      collection([part(1, "2001-12-19"), part(2, "2002-12-18"), part(3, "2003-12-17")]),
      new Set([1]),
      now,
    );
    expect(result.c.count).toBe(2);
    expect(result.c.parts[0]).toMatchObject({ tmdbId: 1, owned: true });
    expect(result.c.parts[1]).not.toHaveProperty("releases");
  });

  it("leaves out parts in cinemas only, announced or undated", () => {
    const result = missingCollections(
      collection([
        part(1, "2001-01-01"),
        part(2, "2026-05-01", { theatrical: "2026-05-01", digital: null, physical: null }),
        part(3, "2027-01-01"),
        part(4, null),
      ]),
      new Set([1]),
      now,
    );
    expect(result).toEqual({});
  });

  it("counts a recent part as out once it's digital", () => {
    const result = missingCollections(
      collection([part(1, "2026-03-01", { theatrical: "2026-03-01", digital: "2026-05-20", physical: null })]),
      new Set(),
      now,
    );
    expect(result.c.count).toBe(1);
  });

  it("doesn't count a recent part without release dates", () => {
    expect(missingCollections(collection([part(1, "2026-03-01")]), new Set(), now)).toEqual({});
  });
});

describe("computeMissing", () => {
  it("needs a TMDB sync first", () => {
    expect(() => computeMissing()).toThrow(/Sync TMDB first/);
  });

  it("writes what it finds", () => {
    replaceJellyfin(
      {
        movies: [movie({ Id: "m1", ProviderIds: { Tmdb: "1", TmdbCollection: "c" } })],
        shows: [],
        episodes: [ep("s", 1, 1)],
      },
      "2026-06-15T00:00:00Z",
    );
    replaceTmdb(
      { s: { tmdbId: "9", seasons: [{ season: 1, airedEpisodeNumbers: [1, 2], episodeNumbers: [1, 2] }] } },
      {
        c: {
          name: "C",
          posterPath: null,
          parts: [
            { tmdbId: 1, title: "Part 1", releaseDate: "2001-01-01", posterPath: null },
            { tmdbId: 2, title: "Part 2", releaseDate: "2002-01-01", posterPath: null },
          ],
        },
      },
      "2026-06-15T00:00:00Z",
    );

    const result = computeMissing(new Date("2026-06-15T12:00:00Z"));

    expect(result).toMatchObject({ incompleteCount: 1, incompleteCollectionCount: 1, mismatchCount: 0 });
    expect(getMissingSeries().s.seasons[0].episodes).toBe("2");
    expect(getMissingCollections().c.parts.map((p) => p.owned)).toEqual([true, false]);
    expect(getMismatches()).toEqual({});
    expect(syncedAt("missing")).toBe("2026-06-15T12:00:00.000Z");
  });
});
