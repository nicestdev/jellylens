import { describe, expect, it } from "vitest";
import type { AnalyticsResponse, FilePart } from "@/lib/api-types";
import { audioRows, codecRows, groupRows, overviewTiles, percent, resolutionRows } from "./logic";

const GB = 1e9;
const TB = 1024 ** 4;
const part = <V = string>(value: V, movies: number, episodes = 0, size = GB): FilePart<V> => ({
  value,
  movies,
  episodes,
  size,
});
const totals = (titles: number, files: number, size: number, seconds: number) => ({
  titles,
  files,
  size,
  seconds,
  pending: false,
});

// As /api/analytics sends it: the largest first.
const data = (over: Partial<AnalyticsResponse> = {}): AnalyticsResponse => ({
  movies: totals(683, 690, 2.38 * TB, 1331 * 3600),
  shows: totals(249, 11386, 5.77 * TB, 7204 * 3600),
  resolutions: [part("1080p", 3, 2), part("", 1), part("4K", 1)],
  codecs: [part("", 4), part("x265", 3), part("x264", 1)],
  quality: [],
  audio: [part("DE", 2), part("", 1), part("DE+EN", 4, 1)],
  groups: [],
  ...over,
});

describe("overviewTiles", () => {
  it("has Storage, Movies and Shows, each with its hint as values", () => {
    expect(overviewTiles(data())).toEqual([
      { label: "Storage", value: "8.15 TB", hint: ["2.38 TB movies", "5.77 TB shows"] },
      { label: "Movies", value: "683", hint: ["1331 h runtime"] },
      { label: "Shows", value: "249", hint: ["11386 episodes", "7204 h runtime"] },
    ]);
  });
});

describe("rows", () => {
  it("puts resolutions best first and codecs largest first, unknown last", () => {
    expect(resolutionRows(data()).map((r) => r.label)).toEqual(["4K", "1080p", "Unknown"]);
    expect(codecRows(data()).map((r) => r.label)).toEqual(["x265", "x264", "Unknown"]);
  });

  it("puts German and English together first, then one, none tagged last", () => {
    expect(audioRows(data()).map((r) => [r.label, r.movies, r.episodes])).toEqual([
      ["German & English", 4, 1],
      ["German only", 2, 0],
      ["Not tagged", 1, 0],
    ]);
  });

  it("gives each row the table's total for its share", () => {
    expect(new Set(resolutionRows(data()).map((r) => r.total))).toEqual(new Set([3 * GB]));
  });
});

describe("groupRows", () => {
  it("names the ten largest groups, folds the rest into one row, and the files without one last", () => {
    const named = Array.from({ length: 12 }, (_, i) => part<string | null>(`G${i + 1}`, 1, 0, (12 - i) * GB));
    const rows = groupRows(data({ groups: [...named, part<string | null>(null, 2)] }));
    expect(rows.map((r) => r.label)).toEqual([...Array.from({ length: 10 }, (_, i) => `G${i + 1}`), "2 others", "n/a"]);
    expect(rows[10]).toMatchObject({ movies: 2, size: 3 * GB });
  });

  it("has no others row when there are ten or fewer", () => {
    expect(groupRows(data({ groups: [part<string | null>("FuN", 1)] })).map((r) => r.label)).toEqual(["FuN"]);
  });
});

describe("percent", () => {
  it("always gives one decimal, a sliver at least 0.1 %, all but a sliver at most 99.9 %", () => {
    expect(percent(58, 100)).toBe("58.0 %");
    expect(percent(583, 1000)).toBe("58.3 %");
    expect(percent(1, 100000)).toBe("0.1 %");
    // Not all of it: 9999 of 10000.
    expect(percent(9999, 10000)).toBe("99.9 %");
    expect(percent(649, 649)).toBe("100.0 %");
    expect(percent(0, 100)).toBe("0.0 %");
    expect(percent(0, 0)).toBe("0.0 %");
  });
});
