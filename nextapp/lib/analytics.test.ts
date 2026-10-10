import { describe, expect, it } from "vitest";
import { codecLabel, releaseGroupOf, storedFiles, type MediaFile, type MediaItem } from "./analytics";

describe("releaseGroupOf", () => {
  it("reads the group after the last dash of a scene-style name", () => {
    expect(releaseGroupOf("Heat.1995.German.DL.1080p.BluRay.x264-GRP.mkv")).toBe("GRP");
    expect(releaseGroupOf("Spider-Man.2002.German.DTS-HD.1080p.BluRay.x264-SpiCy.mkv")).toBe("SpiCy");
    expect(releaseGroupOf("Heat.1995.1080p.x265-FuN[rarbg].mkv")).toBe("FuN");
    // A codec after the dash is no group.
    expect(releaseGroupOf("Heat.1995.1080p.WEB-AV1.mkv")).toBeNull();
    // An invisible character after it, a space in an episode's title.
    expect(releaseGroupOf("The.OA.S02E01.Engel.des.Todes.GERMAN.AC3.720p.WebDL.x265-w00t\u200b.mkv")).toBe("w00t");
    expect(releaseGroupOf("The.Wire.S02E05.Neue Faelle.alte.Freunde.GERMAN.AAC.720p.BluRay.x265-w00t.mkv")).toBe(
      "w00t",
    );
  });

  it("reads it after Sonarr's and Radarr's bracketed quality", () => {
    expect(releaseGroupOf("Silo - S01E01 - Freedom Day [WEBDL-1080p][x264]-GRP.mkv")).toBe("GRP");
  });

  it("reads it first in a scene short name, unless that's the show's title", () => {
    expect(releaseGroupOf("pl3x-heman.s01e01-1080p.mkv", undefined, "He-Man")).toBe("pl3x");
    expect(releaseGroupOf("dmpd-fresh.off.the.boat.s01e01.german.dl.1080p.web.h264.mkv")).toBe("dmpd");
    expect(releaseGroupOf("tvs-young-sheldon-dd51-ded-dl-7p-azhd-avc-s06e02.mkv")).toBe("tvs");
    expect(releaseGroupOf("spider-man.s01e01.mkv", undefined, "Spider-Man")).toBeNull();
    // Only all lowercase, and only an episode.
    expect(releaseGroupOf("Tvs-young-sheldon-s06e02.mkv")).toBeNull();
    expect(releaseGroupOf("fun-heat-1080p.mkv")).toBeNull();
  });

  it("falls back to the folder", () => {
    expect(releaseGroupOf("s01e01.mkv", "Silo.S01.German.DL.1080p.WEB.h264-GRP")).toBe("GRP");
    expect(releaseGroupOf("Silo.S01E01.mkv", "Season 1")).toBeNull();
  });

  it("finds none in names that aren't scene-style", () => {
    expect(releaseGroupOf("Heat (1995) - 1080p.mkv")).toBeNull();
    expect(releaseGroupOf("Heat (1995) [Bluray-1080p].mkv")).toBeNull();
    expect(releaseGroupOf("Spider-Man.mkv")).toBeNull();
    expect(releaseGroupOf("Heat.1995.mkv")).toBeNull();
    expect(releaseGroupOf("Heat.1995.BluRay-1080p.mkv")).toBeNull();
    expect(releaseGroupOf("Inspector.Gadget.1983.S01E01.German.AAC.DVDRiP.HEVC.mkv")).toBeNull();
    expect(releaseGroupOf("")).toBeNull();
  });
});

describe("codecLabel", () => {
  it("names codecs as release names do", () => {
    expect([codecLabel("hevc"), codecLabel("h264"), codecLabel("av1"), codecLabel("prores"), codecLabel("")]).toEqual([
      "x265",
      "x264",
      "AV1",
      "PRORES",
      "",
    ]);
  });
});

describe("storedFiles", () => {
  const file = (Name: string, over: Partial<MediaFile> = {}): MediaFile => ({
    Name,
    Path: Name,
    Size: 1,
    Codec: "hevc",
    ...over,
  });
  const item = (over: Partial<MediaItem> & { id: string }): MediaItem => ({
    kind: "movie",
    parentId: over.id,
    title: over.id,
    year: null,
    tmdbId: null,
    files: [],
    ...over,
  });

  it("reads each file's group, resolution, codec and languages, with its movie's title", () => {
    const rows = storedFiles([
      item({
        id: "m1",
        title: "Die Brücke",
        year: 1959,
        tmdbId: "7",
        width: 1920,
        files: [
          file("Die.Bruecke.1959.2160p.x265-FuN.mkv", { Size: 9, Width: 3840, Height: 1600, Languages: ["DE", "EN"] }),
          file("Die Bruecke.mkv", { Codec: "" }),
        ],
      }),
    ]);
    expect(rows).toEqual([
      {
        kind: "movie",
        itemId: "m1",
        idx: 0,
        parentId: "m1",
        title: "Die Brücke",
        year: 1959,
        tmdbId: "7",
        season: null,
        episode: null,
        episodeEnd: null,
        episodeTitle: null,
        fileName: "Die.Bruecke.1959.2160p.x265-FuN.mkv",
        path: "Die.Bruecke.1959.2160p.x265-FuN.mkv",
        size: 9,
        group: "FuN",
        groupKey: "fun",
        resolution: "4K",
        codec: "x265",
        languages: ["DE", "EN"],
        search: "die bruecke die brucke die bruecke 1959 2160p x265 fun mkv",
      },
      // No size of its own: the movie's.
      expect.objectContaining({ idx: 1, group: null, groupKey: null, resolution: "1080p", codec: "", languages: [] }),
    ]);
  });

  it("keeps an episode's show and numbers, searchable by its code", () => {
    const [row] = storedFiles([
      item({
        kind: "episode",
        id: "e1",
        parentId: "s1",
        title: "Silo",
        season: 1,
        episode: 2,
        episodeTitle: "Holston",
        files: [file("s01e02.mkv", { Folder: "Silo.S01.German.DL.1080p.WEB.h264-GRP" })],
      }),
    ]);
    expect(row).toMatchObject({
      kind: "episode",
      parentId: "s1",
      season: 1,
      episode: 2,
      group: "GRP",
      search: "silo silo holston s01e02 s01e02 mkv",
    });
  });

  it("names a group as first spelled in the library", () => {
    const rows = storedFiles([
      item({ id: "m1", files: [file("A.2001.1080p-FuN.mkv")] }),
      item({ id: "m2", files: [file("B.2002.1080p-FUN.mkv")] }),
    ]);
    expect(rows.map((r) => [r.group, r.groupKey])).toEqual([
      ["FuN", "fun"],
      ["FuN", "fun"],
    ]);
  });
});
