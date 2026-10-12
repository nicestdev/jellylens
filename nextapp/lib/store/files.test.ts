import { describe, expect, it } from "vitest";
import { storedFiles, type MediaFile, type MediaItem } from "@/lib/analytics";
import { movie, show } from "@/test/fixtures";
import {
  filesByAudio,
  filesByCodec,
  filesByGroup,
  filesByQuality,
  filesByResolution,
  libraryTotals,
  replaceLibrary,
} from ".";

const file = (name: string, size: number, over: Partial<MediaFile> = {}): MediaFile => ({
  name,
  path: name,
  size,
  codec: "hevc",
  width: 1920,
  height: 800,
  languages: ["DE"],
  ...over,
});
const film = (id: string, title: string, year: number | null, files: MediaFile[]): MediaItem => ({
  kind: "movie",
  id,
  parentId: id,
  title,
  year,
  tmdbId: null,
  files,
});
const episode = (id: string, season: number, n: number, files: MediaFile[]): MediaItem => ({
  kind: "episode",
  id,
  parentId: "s1",
  title: "Silo",
  year: 2023,
  tmdbId: "125988",
  season,
  episode: n,
  episodeTitle: `Episode ${n}`,
  files,
});

// Five movies, six files (Alien in two versions by two groups), and one
// show with two episodes.
function library() {
  const items = [
    film("m1", "Heat", 1995, [file("Heat.1995.1080p.x265-FuN.mkv", 10, { languages: ["DE", "EN"] })]),
    film("m2", "Alien", 1979, [
      file("Alien.1979.2160p.x265-GRP.mkv", 40, { width: 3840, height: 1600 }),
      file("Alien.1979.1080p.x264-fun.mkv", 8, { codec: "h264" }),
    ]),
    film("m3", "Die Brücke", 1959, [file("Die.Bruecke.1959.1080p.x264-GRP.mkv", 5, { codec: "h264" })]),
    film("m4", "Brazil", 1985, [file("Brazil (1985).mkv", 7, { codec: "", width: 0, height: 0, languages: [] })]),
    film("m5", "Zelig", null, []),
    episode("e2", 1, 2, [file("Silo - S01E02 - Holston.mkv", 2)]),
    episode("e1", 1, 1, [file("s01e01.mkv", 3, { folder: "Silo.S01.German.DL.1080p.WEB.h264-cnhd" })]),
  ];
  replaceLibrary(
    {
      movies: ["m1", "m2", "m3", "m4", "m5"].map((id) => movie({ id })),
      shows: [show({ id: "s1" }), show({ id: "s2" })],
      episodes: [],
      files: storedFiles(items),
    },
    "2026-10-01T00:00:00.000Z",
  );
}

describe("library files", () => {
  it("sums up each library's files", () => {
    library();
    expect(libraryTotals("movies")).toEqual({ titles: 5, files: 5, size: 70, seconds: 0, pending: false });
    // Two shows, one with episodes.
    expect(libraryTotals("shows")).toEqual({ titles: 2, files: 2, size: 5, seconds: 0, pending: false });
  });

  it("is pending while there are titles but no files", () => {
    replaceLibrary({ movies: [movie({ id: "m1" })], shows: [], episodes: [] }, null);
    expect(libraryTotals("movies")).toMatchObject({ files: 0, pending: true });
    expect(libraryTotals("shows")).toMatchObject({ titles: 0, pending: false });
  });

  it("splits both libraries' files and bytes by group, resolution, codec and audio, the largest first", () => {
    library();
    // FuN and fun are one group; an episode's group can come from its folder.
    expect(filesByGroup()).toEqual([
      { value: "GRP", movies: 2, episodes: 0, size: 45 },
      { value: "FuN", movies: 2, episodes: 0, size: 18 },
      { value: null, movies: 1, episodes: 1, size: 9 },
      { value: "cnhd", movies: 0, episodes: 1, size: 3 },
    ]);
    expect(filesByResolution()).toEqual([
      { value: "4K", movies: 1, episodes: 0, size: 40 },
      { value: "1080p", movies: 3, episodes: 2, size: 28 },
      { value: "", movies: 1, episodes: 0, size: 7 },
    ]);
    expect(filesByCodec().map((p) => [p.value, p.movies, p.episodes])).toEqual([
      ["x265", 2, 2],
      ["x264", 2, 0],
      ["", 1, 0],
    ]);
    // Both, one, none tagged.
    expect(filesByAudio().sort((a, b) => b.size - a.size)).toEqual([
      { value: "DE", movies: 3, episodes: 2, size: 58 },
      { value: "DE+EN", movies: 1, episodes: 0, size: 10 },
      { value: "", movies: 1, episodes: 0, size: 7 },
    ]);
    expect(filesByQuality()).toEqual(
      expect.arrayContaining([
        { resolution: "4K", codec: "x265", files: 1, size: 40 },
        { resolution: "1080p", codec: "x265", files: 3, size: 15 },
        { resolution: "1080p", codec: "x264", files: 2, size: 13 },
        { resolution: "", codec: "", files: 1, size: 7 },
      ]),
    );
  });

  it("is replaced with the library at every sync", () => {
    library();
    replaceLibrary({ movies: [], shows: [], episodes: [] }, null);
    expect(libraryTotals("movies")).toMatchObject({ titles: 0, files: 0 });
    expect(libraryTotals("shows")).toMatchObject({ titles: 0, files: 0 });
  });
});
