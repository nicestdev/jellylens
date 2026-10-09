import { describe, expect, it } from "vitest";
import {
  audioOf,
  codecOf,
  episodesOf,
  movieUnits,
  seasonUnits,
  tierOfFile,
  tierOfRelease,
  type GroupRelease,
  type OwnedFile,
} from "./upgrades";

const MB = 1024 * 1024;

const owned = (over: Partial<OwnedFile> = {}): OwnedFile => ({
  parentId: "m1",
  title: "Heat",
  year: 1995,
  tmdbId: "949",
  imageTag: "tag",
  season: null,
  episode: null,
  episodeEnd: null,
  fileName: "Heat.1995.German.1080p.BluRay.x264-w00t.mkv",
  size: 8000 * MB,
  group: "w00t",
  resolution: "1080p",
  codec: "x264",
  languages: ["DE"],
  ...over,
});

const release = (name: string, over: Partial<GroupRelease> = {}): GroupRelease => ({
  tmdbId: 949,
  group: "VECTOR",
  name,
  quality: "HD-1080p",
  sizeMb: 9000,
  publishedAt: 1000,
  ...over,
});

describe("release names", () => {
  it("reads the quality as one name for files and releases", () => {
    expect(tierOfRelease("HD-2160p")).toBe("2160p");
    expect(tierOfRelease("HD-720p")).toBe("720p");
    expect(tierOfRelease("x264-SD")).toBe("SD");
    expect(tierOfRelease("")).toBe("");
    expect(tierOfFile("4K")).toBe("2160p");
    expect(tierOfFile("1080p")).toBe("1080p");
  });

  it("reads DL and ML, but not WEB-DL", () => {
    expect(audioOf("Heat.1995.German.DL.1080p.BluRay.x264-VECTOR")).toBe("DL");
    expect(audioOf("Spy.x.Family.S01E25.German.ML.1080p.WEB.H264-ZeroTwo")).toBe("ML");
    expect(audioOf("Heat.1995.German.1080p.WEB-DL.x264-GRP")).toBeNull();
  });

  it("reads the codec as Analytics labels it", () => {
    expect(codecOf("Heat.1995.German.DL.1080p.WEB.H265-ZeroTwo")).toBe("x265");
    expect(codecOf("Heat.1995.German.DL.1080p.BluRay.HEVC-GRP")).toBe("x265");
    expect(codecOf("Heat.1995.German.DL.1080p.WEB.h264-GRP")).toBe("x264");
    expect(codecOf("Heat.1995.German.DL.2160p.WEB.AV1-GRP")).toBe("AV1");
    expect(codecOf("Heat.1995.German.DL.1080p.AMZN.WEB-ZeroTwo")).toBe("");
  });

  it("reads a show release's season and episodes", () => {
    expect(episodesOf("Silo.2023.S01E02.German.DL.1080p.WEB.H264-ZeroTwo")).toEqual({ season: 1, episodes: [2] });
    expect(episodesOf("Silo.2023.S01E01E02.German.DL.1080p.WEB.H264-ZeroTwo")).toEqual({ season: 1, episodes: [1, 2] });
    expect(episodesOf("Silo.2023.S01E01-E03.German.DL.1080p.WEB.H264-ZeroTwo")).toEqual({
      season: 1,
      episodes: [1, 2, 3],
    });
    expect(episodesOf("Silo.2023.S02.German.DL.1080p.WEB.H264-ZeroTwo")).toEqual({ season: 2, episodes: null });
    expect(episodesOf("Silo.S01-S02.German.DL.1080p.WEB.H264-ZeroTwo")).toBeNull();
  });
});

describe("movieUnits", () => {
  it("has a unit per movie with its files and every favorite's release of it", () => {
    const [unit] = movieUnits(
      [
        owned(),
        owned({
          fileName: "Heat.1995.German.2160p.UHD.x265-FUN.mkv",
          group: "FUN",
          resolution: "1080p",
          size: 2000 * MB,
        }),
      ],
      [
        release("Heat.1995.German.DTSD.DL.1080p.BluRay.x264-VECTOR"),
        release("Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR", { quality: "HD-2160p", sizeMb: null }),
        release("Alien.1979.German.DL.1080p.BluRay.x264-VECTOR", { tmdbId: 348 }),
      ],
    );
    expect(unit).toMatchObject({
      key: "m1",
      tmdbId: 949,
      season: null,
      fileName: "Heat.1995.German.1080p.BluRay.x264-w00t.mkv",
      files: 2,
      size: 10000 * MB,
      groups: [
        { name: "w00t", files: 1 },
        { name: "FUN", files: 1 },
      ],
      tier: "1080p",
      codec: "x264",
      languages: ["DE"],
    });
    expect(unit.alternatives).toEqual([
      {
        group: "VECTOR",
        tier: "1080p",
        codec: "x264",
        name: "Heat.1995.German.DTSD.DL.1080p.BluRay.x264-VECTOR",
        size: 9000 * MB,
        audio: "DL",
        pack: false,
        episodes: 1,
        publishedAt: 1000,
      },
      expect.objectContaining({ tier: "2160p", codec: "x265", size: null }),
    ]);
  });

  it("keeps only the languages every file has", () => {
    const [unit] = movieUnits([owned({ languages: ["DE", "EN"] }), owned({ languages: ["DE"] })], []);
    expect(unit.languages).toEqual(["DE"]);
    expect(unit.alternatives).toEqual([]);
  });
});

describe("seasonUnits", () => {
  const ep = (season: number, episode: number, over: Partial<OwnedFile> = {}) =>
    owned({
      parentId: "s1",
      title: "Silo",
      year: 2023,
      tmdbId: "125988",
      season,
      episode,
      fileName: `Silo.S0${season}E0${episode}.German.1080p.WEB.x264-w00t.mkv`,
      size: 1000 * MB,
      ...over,
    });
  const zt = (name: string, over: Partial<GroupRelease> = {}) =>
    release(`Silo.2023.${name}.German.DL.1080p.WEB.H264-ZeroTwo`, {
      tmdbId: 125988,
      group: "ZeroTwo",
      sizeMb: 800,
      ...over,
    });

  it("has a unit per season, offering a pack and all owned episodes one by one", () => {
    const units = seasonUnits(
      [ep(1, 1), ep(1, 2), ep(2, 1)],
      [
        zt("S01", { sizeMb: 3000, publishedAt: 5 }),
        zt("S01E01", { publishedAt: 3 }),
        zt("S01E02", { publishedAt: 9 }),
        zt("S02E02"),
      ],
    );
    expect(units.map((u) => u.key)).toEqual(["s1:1", "s1:2"]);
    const [first, second] = units;
    expect(first).toMatchObject({
      season: 1,
      files: 2,
      size: 2000 * MB,
      fileName: "Silo.S01E01.German.1080p.WEB.x264-w00t.mkv",
    });
    expect(first.alternatives).toEqual([
      expect.objectContaining({
        group: "ZeroTwo",
        pack: true,
        episodes: 2,
        size: 3000 * MB,
        name: "Silo.2023.S01.German.DL.1080p.WEB.H264-ZeroTwo",
      }),
      // The episodes add up; the newest of them says when.
      expect.objectContaining({
        pack: false,
        episodes: 2,
        size: 1600 * MB,
        name: "Silo.2023.S01E01.German.DL.1080p.WEB.H264-ZeroTwo",
        publishedAt: 9,
      }),
    ]);
    // ZeroTwo has episode 2 of season 2, not the one you have: nothing.
    expect(second.alternatives).toEqual([]);
  });

  it("keeps each codec apart, and has no size when one episode has none", () => {
    const [unit] = seasonUnits(
      [ep(1, 1), ep(1, 2)],
      [
        zt("S01E01"),
        zt("S01E02", { sizeMb: null }),
        release("Silo.2023.S01E01.German.DL.1080p.WEB.H265-ZeroTwo", { tmdbId: 125988, group: "ZeroTwo" }),
      ],
    );
    expect(unit.alternatives).toEqual([expect.objectContaining({ codec: "x264", episodes: 2, size: null })]);
  });

  it("counts a file holding two episodes as both", () => {
    const [unit] = seasonUnits([ep(1, 1, { episodeEnd: 2 })], [zt("S01E01"), zt("S01E02")]);
    expect(unit.alternatives).toEqual([expect.objectContaining({ episodes: 2, size: 1600 * MB })]);
  });
});
