import { describe, expect, it } from "vitest";
import { releaseGroupOf } from "./analytics";
import { dottedName, groupOf, toReleases } from "./wcx";
import { sceneQuality } from "./xrel";

describe("dottedName", () => {
  it("reads quality and group from a name typed with spaces", () => {
    const name = dottedName("Vice Der zweite Mann 2018 German DTS DL 1080p BluRay x264 - LeetHD (DDL)");
    expect(name).toBe("Vice.Der.zweite.Mann.2018.German.DTS.DL.1080p.BluRay.x264-LeetHD");
    expect([sceneQuality(name), releaseGroupOf(name)]).toEqual(["HD-1080p", "LeetHD"]);
    expect(releaseGroupOf(dottedName("The Last Mercenary 2021 German AC3 1080p WebRip x265-FuN"))).toBe("FuN");
  });

  it("takes a group only from the name's end, and never p2p", () => {
    expect(groupOf(dottedName("Der Hobbit 2012 German 2160p UHD BluRay HEVC Remux - p2p (RG)"))).toBeUndefined();
    expect(groupOf("House.of.Gucci.2021.German.DL.LD.2160p.WEB")).toBeUndefined();
    expect(groupOf(dottedName("Tenet 2020 IMAX German AC3D BDRip x264 - miSD (DDL)"))).toBe("miSD");
  });

  it("leaves a release name as it is", () => {
    expect(dottedName("Heat.1995.German.DL.1080p.BluRay.x264-FuN")).toBe("Heat.1995.German.DL.1080p.BluRay.x264-FuN");
  });
});

describe("toReleases", () => {
  it("stores a name typed with spaces as a release name, so title and year read from it", () => {
    const [r] = toReleases({
      uid: "abc",
      type: "series",
      updated_at: "2026-10-16T12:00:00.000000Z",
      options: { imdb_id: "tt1" },
      releases: [{ id: 7, fulltitle: " Red Dawn 2012 German DTS DL 1080p BluRay x265 - UNFIrED (DDL)" }],
    });
    expect(r).toMatchObject({
      id: "wcx:7",
      name: "Red.Dawn.2012.German.DTS.DL.1080p.BluRay.x265-UNFIrED",
      type: "tv",
      quality: "HD-1080p",
      titleKey: "wcx:abc",
      imdbId: "tt1",
      group: "UNFIrED",
      publishedAt: Date.parse("2026-10-16T12:00:00Z") / 1000,
    });
  });
});

describe("toReleases by year", () => {
  it("splits a movie's releases by the year in their names, a show's not", () => {
    const entry = (type: string) => ({
      uid: "u",
      type,
      updated_at: "2026-10-16T12:00:00Z",
      releases: [
        { id: 1, fulltitle: "Red.Dawn.2012.German.DL.1080p.BluRay.x264-LeetHD" },
        { id: 2, fulltitle: "Die.Rote.Flut.1984.German.DL.2160p.UHD.BluRay.x265-ENDSTATiON" },
      ],
    });
    expect(toReleases(entry("movie")).map((r) => r.titleKey)).toEqual(["wcx:u~2012", "wcx:u~1984"]);
    expect(toReleases(entry("series")).map((r) => r.titleKey)).toEqual(["wcx:u", "wcx:u"]);
  });
});
