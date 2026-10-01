import { describe, expect, it } from "vitest";
import type { MatchInfo } from "./api-types";
import type { TitleRelease } from "./store";
import { groupEpisodes, matchActions, matchNote, qualityLabel, releasedHint, releasedLabel, titleMeta } from "./release-labels";

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
  const match = (over: Partial<MatchInfo>): MatchInfo => ({ status: "verified", shown: null, verdict: null, candidate: null, ...over });
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
    expect(verdicts(match({ status: "rejected", verdict: "wrong", candidate: { title: "Dune", year: null } }))).toEqual(["xrel", null]);
    expect(matchNote(match({ status: "rejected", verdict: "wrong" }))).toBe("Marked as a wrong match by you.");
  });
});

describe("groupEpisodes", () => {
  const r = (id: string, name: string, group = "WAYNE"): TitleRelease => ({
    id,
    name,
    link: "https://www.xrel.to/release/" + id,
    quality: "HD-1080p",
    publishedAt: Number(id),
    group,
  });

  it("puts a season's single episodes on one line, newest first, as many as it has", () => {
    expect(
      groupEpisodes([
        r("4", "Silo.S01E03.German.DL.1080p.WEB.h264-WAYNE"),
        r("3", "Silo.S01E01E02.German.DL.1080p.WEB.h264-WAYNE"),
        r("2", "Silo.S02E01.German.DL.1080p.WEB.h264-WAYNE"),
        r("1", "Silo.S02E02-E03.German.DL.1080p.WEB.h264-WAYNE"),
      ])
    ).toEqual([
      { ...r("4", "Silo.S01.German.DL.1080p.WEB.h264-WAYNE"), episodes: 3 },
      { ...r("2", "Silo.S02.German.DL.1080p.WEB.h264-WAYNE"), episodes: 3 },
    ]);
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
