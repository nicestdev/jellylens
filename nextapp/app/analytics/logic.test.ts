import { describe, expect, it } from "vitest";
import type { AnalyticsResponse, FilePart } from "@/lib/api-types";
import {
  SERIES_COLORS,
  codecSegments,
  filesUrl,
  groupSegments,
  languageSegments,
  overviewTiles,
  pageText,
  percent,
  resolutionSegments,
  subtitle,
} from "./logic";

const GB = 1024 ** 3;
const part = <V = string>(value: V, files: number, size = files): FilePart<V> => ({ value, files, size });

// As /api/analytics sends them: most files first.
const movies = (over: Partial<AnalyticsResponse["movies"]> = {}): AnalyticsResponse["movies"] => ({
  titles: 3,
  withFiles: 3,
  files: 4,
  size: 4 * GB,
  pending: false,
  groups: [part<string | null>("FuN", 2, GB), part<string | null>("GRP", 1, 2 * GB), part<string | null>(null, 1, GB)],
  resolutions: [part("1080p", 3), part("4K", 1)],
  codecs: [part("x265", 3), part("", 1)],
  languages: [part("DE", 4), part("EN", 2)],
  ...over,
});

describe("overview", () => {
  it("has a tile each for movies, their average and total size, and groups", () => {
    expect(overviewTiles(movies())).toEqual([
      { label: "Movies", value: "3", hint: "in the library" },
      { label: "Average size", value: "1,33 GB", hint: "per movie" },
      { label: "Total size", value: "4,00 GB", hint: "in 4 files" },
      { label: "Release groups", value: "2", hint: "named in 75 % of files" },
    ]);
  });

  it("counts a show's episodes as its files", () => {
    expect(overviewTiles(movies({ titles: 5, withFiles: 2 }), "shows").slice(0, 3)).toEqual([
      { label: "Shows", value: "5", hint: "in the library" },
      { label: "Files", value: "4", hint: "episodes of 2 shows" },
      { label: "Total size", value: "4,00 GB", hint: "Ø 2,00 GB per show" },
    ]);
  });

  it("says where the numbers are from", () => {
    expect(subtitle(null)).toBe("Loading…");
    expect(subtitle({ movies: movies(), shows: movies(), syncedAt: null })).toBe("From the Jellyfin sync never");
  });
});

describe("share chart segments", () => {
  it("colors the groups with the most files and folds the rest", () => {
    const groups = ["B", "C", "D", "F", "E", "A", "G"].map((g, i) => part<string | null>(g, 9 - i));
    const segments = groupSegments(movies({ groups: [...groups, part<string | null>(null, 3)] }));
    expect(segments.map((s) => [s.key, s.label, s.files, s.muted])).toEqual([
      ["groups:B", "B", 9, false],
      ["groups:C", "C", 8, false],
      ["groups:D", "D", 7, false],
      ["groups:F", "F", 6, false],
      ["groups:E", "E", 5, false],
      ["groups-other", "2 others", 7, true],
      ["groups-none", "n/a", 3, true],
    ]);
    expect(segments.slice(0, 5).map((s) => s.color)).toEqual(SERIES_COLORS);
    expect(new Set(segments.map((s) => s.color)).size).toBe(segments.length);
  });

  it("does the same for resolutions and codecs, unknown last", () => {
    const m = movies({
      resolutions: [part("", 5), part("1080p", 3), part("4K", 1)],
      codecs: ["x265", "x264", "AV1", "VC-1", "MPEG-2", "VP9", "PRORES"].map((c, i) => part(c, 9 - i)),
    });
    expect(resolutionSegments(m).map((s) => [s.key, s.label])).toEqual([
      ["resolutions:1080p", "1080p"],
      ["resolutions:4K", "4K"],
      ["resolutions-none", "Unknown"],
    ]);
    expect(codecSegments(m).map((s) => s.label)).toEqual(["x265", "x264", "AV1", "VC-1", "MPEG-2", "2 others"]);
  });

  it("gives German, English and Spanish a ring each, in fixed colors", () => {
    const languages = ["EN", "DE", "JA", "FR", "ES", "IT"].map((c, i) => part(c, 9 - i));
    const segments = languageSegments(movies({ languages: [...languages, part("", 2)] }));
    expect(segments.map((s) => [s.key, s.label, s.files, s.color])).toEqual([
      ["languages:DE", "German", 8, SERIES_COLORS[0]],
      ["languages:EN", "English", 9, SERIES_COLORS[1]],
      ["languages:ES", "Spanish", 5, SERIES_COLORS[2]],
    ]);
    // Spanish missing: no ring, the others keep their colors.
    expect(languageSegments(movies()).map((s) => [s.label, s.color])).toEqual([
      ["German", SERIES_COLORS[0]],
      ["English", SERIES_COLORS[1]],
    ]);
  });

  it("leaves out empty parts", () => {
    expect(groupSegments(movies({ groups: [part<string | null>("A", 1)] })).map((s) => s.key)).toEqual(["groups:A"]);
  });
});

describe("percent", () => {
  it("always gives one decimal, a sliver at least 0,1 %, all but a sliver at most 99,9 %", () => {
    expect(percent(58, 100)).toBe("58,0 %");
    expect(percent(583, 1000)).toBe("58,3 %");
    expect(percent(1, 100000)).toBe("0,1 %");
    // Not all of it: 9999 of 10000.
    expect(percent(9999, 10000)).toBe("99,9 %");
    expect(percent(649, 649)).toBe("100,0 %");
    expect(percent(0, 100)).toBe("0,0 %");
    expect(percent(0, 0)).toBe("0,0 %");
  });
});

describe("the file list", () => {
  it("asks the server for a page, the search trimmed", () => {
    expect(filesUrl("shows", " heat ", "size", "desc", 50)).toBe(
      "/api/analytics/files?library=shows&q=heat&sort=size&dir=desc&offset=50",
    );
  });

  it("says which files a page shows", () => {
    expect(pageText(0, 50, 103)).toBe("1–50 of 103 files");
    expect(pageText(100, 3, 103)).toBe("101–103 of 103 files");
    expect(pageText(0, 0, 0)).toBe("No files");
  });
});
