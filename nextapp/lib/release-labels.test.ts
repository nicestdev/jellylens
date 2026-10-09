import { describe, expect, it } from "vitest";
import type { MatchInfo } from "./api-types";
import type { TitleRelease } from "./store";
import {
  groupEpisodes,
  matchActions,
  matchNote,
  qualityLabel,
  withoutTitle,
  releasedHint,
  releasedLabel,
  resolutionOf,
  seasonsOf,
  titleMeta,
} from "./release-labels";

describe("releasedLabel", () => {
  it("names the first group and how many more, and all of them on hover", () => {
    expect(releasedLabel(["VECTOR"])).toBe("VECTOR");
    expect(releasedLabel(["FuN", "VECTOR"])).toBe("FuN +1");
    expect(releasedLabel(["FuN", "VECTOR", "W00T"])).toBe("FuN +2");
    expect(releasedLabel([])).toBe("");
    expect(releasedHint(["FuN", "VECTOR"])).toBe("Released by FuN, VECTOR");
  });
});

describe("qualityLabel and titleMeta", () => {
  it("drops xREL's HD- prefix", () => {
    expect(qualityLabel("HD-1080p")).toBe("1080p");
    expect(qualityLabel("XviD")).toBe("XviD");
  });

  it("shows the year and the number of releases, once that's known", () => {
    expect(titleMeta({ year: 2021, releases: 3 })).toBe("2021 · 3 releases");
    expect(titleMeta({ year: null, releases: 1 })).toBe("1 release");
    expect(titleMeta({ year: 2021 })).toBe("2021");
  });
});

describe("matchActions and matchNote", () => {
  const match = (over: Partial<MatchInfo>): MatchInfo => ({
    status: "verified",
    shown: null,
    verdict: null,
    candidate: null,
    ...over,
  });
  const verdicts = (m: MatchInfo) => matchActions(m).map((a) => a.verdict);

  it("offers to reject an automatic match", () => {
    expect(verdicts(match({}))).toEqual(["wrong"]);
    expect(verdicts(match({ status: "searched" }))).toEqual(["wrong"]);
    expect(matchNote(match({}))).toBeNull();
  });

  it("offers xREL's candidate when it wasn't taken", () => {
    const candidate = { title: "Dune", year: 2021 };
    expect(matchActions(match({ status: "unverified", candidate }))).toEqual([
      { label: "Use xREL's match: Dune (2021)", verdict: "xrel" },
    ]);
    expect(verdicts(match({ status: "unverified" }))).toEqual([]);
    expect(matchNote(match({ status: "unverified" }))).toBe("Not matched: TMDB doesn't know this title.");
  });

  it("offers to undo a decision by hand", () => {
    expect(verdicts(match({ status: "confirmed", verdict: "xrel" }))).toEqual([null]);
    expect(verdicts(match({ status: "rejected", verdict: "wrong", candidate: { title: "Dune", year: null } }))).toEqual(
      ["xrel", null],
    );
    expect(matchNote(match({ status: "rejected", verdict: "wrong" }))).toBe("Marked as a wrong match by you.");
  });
});

describe("groupEpisodes", () => {
  const r = (id: string, name: string, group = "WAYNE", sizeMb: number | null = 1000): TitleRelease => ({
    id,
    name,
    link: "https://www.xrel.to/release/" + id,
    quality: "HD-1080p",
    publishedAt: Number(id),
    group,
    sizeMb,
  });

  it("puts a season's single episodes on one line, newest first, as many as it has", () => {
    expect(
      groupEpisodes([
        r("4", "Silo.S01E03.German.DL.1080p.WEB.h264-WAYNE"),
        r("3", "Silo.S01E01E02.German.DL.1080p.WEB.h264-WAYNE"),
        r("2", "Silo.S02E01.German.DL.1080p.WEB.h264-WAYNE"),
        r("1", "Silo.S02E02-E03.German.DL.1080p.WEB.h264-WAYNE"),
      ]),
    ).toEqual([
      { ...r("4", "Silo.S01.German.DL.1080p.WEB.h264-WAYNE"), episodes: 3, sizeMb: 2000 },
      { ...r("2", "Silo.S02.German.DL.1080p.WEB.h264-WAYNE"), episodes: 3, sizeMb: 2000 },
    ]);
  });

  it("adds up the episodes' sizes, unless one of them has none", () => {
    const [season] = groupEpisodes([
      r("2", "Silo.S01E02.German.DL.1080p.WEB.h264-WAYNE"),
      r("1", "Silo.S01E01.German.DL.1080p.WEB.h264-WAYNE", "WAYNE", null),
    ]);
    expect(season.sizeMb).toBeNull();
  });

  it("keeps groups and versions apart", () => {
    const grouped = groupEpisodes([
      r("4", "Silo.S01E02.German.DL.1080p.WEB.h264-WAYNE"),
      r("3", "Silo.S01E02.German.DL.1080p.WEB.h264-FuN", "FuN"),
      r("2", "Silo.S01E01.German.DL.1080p.WEB.h264-WAYNE"),
      r("1", "Silo.S01E01.German.DL.720p.WEB.h264-WAYNE"),
    ]);
    expect(grouped.map((g) => [g.name, g.episodes])).toEqual([
      ["Silo.S01.German.DL.1080p.WEB.h264-WAYNE", 2],
      ["Silo.S01E02.German.DL.1080p.WEB.h264-FuN", undefined],
      ["Silo.S01E01.German.DL.720p.WEB.h264-WAYNE", undefined],
    ]);
  });

  it("leaves season packs, movies and a lone episode as they are", () => {
    const items = [
      r("3", "Silo.S01.German.DL.1080p.WEB.h264-WAYNE"),
      r("2", "Silo.S01E05.German.DL.1080p.WEB.h264-WAYNE"),
      r("1", "Heat.1995.German.DL.1080p.BluRay.x264-WAYNE"),
    ];
    expect(groupEpisodes(items)).toEqual(items);
  });
});

describe("resolutionOf", () => {
  it("reads it from the name, else from xREL's category", () => {
    expect(resolutionOf("Heat.1995.German.DL.2160p.WebHD.h265-iNNOVATiV")).toBe("2160p");
    expect(resolutionOf("Heat.1995.German.DL.1080P.BluRay.x264-WAYNE", "HD-720p")).toBe("1080p");
    expect(resolutionOf("Heat.1995.German.DL.BluRay.x264-WAYNE", "HD-720p")).toBe("720p");
  });

  it("counts xREL's SD categories as SD, and knows nothing without either", () => {
    expect(resolutionOf("Heat.1995.German.DVDRip.x264-WAYNE", "x264-SD")).toBe("SD");
    expect(resolutionOf("Heat.1995.German.DVDRip.XviD-WAYNE", "XviD")).toBe("SD");
    expect(resolutionOf("Heat.1995.German.BDRip.x264-KiNOWELT")).toBeNull();
  });
});

describe("seasonsOf", () => {
  it("reads a season, an episode's season, or a range of them", () => {
    expect(seasonsOf("Game.of.Thrones.S01.German.DL.720p.BluRay.x264-GTVG")).toEqual([1, 1]);
    expect(seasonsOf("Show.S02E05.German.1080p.WEB-GRP")).toEqual([2, 2]);
    expect(seasonsOf("Show.S03E01-E02.German.1080p.WEB-GRP")).toEqual([3, 3]);
    expect(seasonsOf("Show.S01-S03.German.1080p.WEB-GRP")).toEqual([1, 3]);
    expect(seasonsOf("Show.S01+S02.GERMAN.1080p.WEB-GRP")).toEqual([1, 2]);
    expect(seasonsOf("Show.S01-03.German.1080p.WEB-GRP")).toEqual([1, 3]);
  });

  it("has none for a movie", () => {
    expect(seasonsOf("Heat.1995.German.DL.1080p.BluRay.x264-WAYNE")).toBeNull();
  });
});

describe("withoutTitle", () => {
  it("cuts a movie's name after its year, the last one before the first tag", () => {
    expect(withoutTitle("300.2006.German.DL.1080p.BluRay.x264-VECTOR")).toBe("German.DL.1080p.BluRay.x264-VECTOR");
    expect(withoutTitle("Blade.Runner.2049.2017.German.DL.2160p.UHD.x265-VECTOR")).toBe(
      "German.DL.2160p.UHD.x265-VECTOR",
    );
    expect(withoutTitle("Heat 1995 German 1080p BluRay x264-w00t")).toBe("German 1080p BluRay x264-w00t");
  });

  it("cuts a show's name after its season or episode", () => {
    expect(withoutTitle("The.Office.S03.German.DL.1080p.WEB.x264-VECTOR")).toBe("German.DL.1080p.WEB.x264-VECTOR");
    expect(withoutTitle("The.Office.S03E04.German.1080p.WEB.x264-VECTOR")).toBe("German.1080p.WEB.x264-VECTOR");
  });

  it("keeps a show's season or episode when asked (a title page lists every season's)", () => {
    expect(withoutTitle("The.Office.S03E04.German.1080p.WEB.x264-VECTOR", { keepEpisode: true })).toBe(
      "S03E04.German.1080p.WEB.x264-VECTOR",
    );
    expect(withoutTitle("300.2006.German.DL.1080p.BluRay.x264-VECTOR", { keepEpisode: true })).toBe(
      "German.DL.1080p.BluRay.x264-VECTOR",
    );
  });

  it("keeps the whole name without a year or season", () => {
    expect(withoutTitle("Heat.German.DL.1080p.BluRay.x264-VECTOR")).toBe("Heat.German.DL.1080p.BluRay.x264-VECTOR");
  });
});
