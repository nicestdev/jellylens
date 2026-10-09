import { describe, expect, it } from "vitest";
import { storedFiles, type MediaFile, type MediaItem } from "@/lib/analytics";
import { movie, show } from "@/test/fixtures";
import {
  fileSummary,
  filesByCodec,
  filesByGroup,
  filesByLanguage,
  filesByResolution,
  queryFiles,
  replaceJellyfin,
  type FileFilters,
} from ".";

const file = (Name: string, Size: number, over: Partial<MediaFile> = {}): MediaFile => ({
  Name,
  Size,
  Codec: "hevc",
  Width: 1920,
  Height: 800,
  Languages: ["DE"],
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
    film("m1", "Heat", 1995, [file("Heat.1995.1080p.x265-FuN.mkv", 10, { Languages: ["DE", "EN"] })]),
    film("m2", "Alien", 1979, [
      file("Alien.1979.2160p.x265-GRP.mkv", 40, { Width: 3840, Height: 1600 }),
      file("Alien.1979.1080p.x264-fun.mkv", 8, { Codec: "h264" }),
    ]),
    film("m3", "Die Brücke", 1959, [file("Die.Bruecke.1959.1080p.x264-GRP.mkv", 5, { Codec: "h264" })]),
    film("m4", "Brazil", 1985, [file("Brazil (1985).mkv", 7, { Codec: "", Width: 0, Height: 0, Languages: [] })]),
    film("m5", "Zelig", null, []),
    episode("e2", 1, 2, [file("Silo - S01E02 - Holston.mkv", 2)]),
    episode("e1", 1, 1, [file("s01e01.mkv", 3, { Folder: "Silo.S01.German.DL.1080p.WEB.h264-cnhd" })]),
  ];
  replaceJellyfin(
    {
      movies: ["m1", "m2", "m3", "m4", "m5"].map((Id) => movie({ Id })),
      shows: [show({ Id: "s1" }), show({ Id: "s2" })],
      episodes: [],
      files: storedFiles(items),
    },
    "2026-10-01T00:00:00.000Z",
  );
}

const filters = (over: Partial<FileFilters> = {}): FileFilters => ({
  words: [],
  groups: [],
  resolutions: [],
  codecs: [],
  languages: [],
  ...over,
});
const names = (f: Partial<FileFilters>, sort: "title" | "size" | "group" = "title", asc = true) =>
  queryFiles("movies", filters(f), sort, asc, 0, 50).items.map((r) => r.fileName);

describe("library files", () => {
  it("sums up each library's files", () => {
    library();
    expect(fileSummary("movies")).toEqual({ titles: 5, withFiles: 4, files: 5, size: 70, pending: false });
    // Two shows, one with episodes.
    expect(fileSummary("shows")).toEqual({ titles: 2, withFiles: 1, files: 2, size: 5, pending: false });
  });

  it("is pending while there are titles but no files", () => {
    replaceJellyfin({ movies: [movie({ Id: "m1" })], shows: [], episodes: [] }, null);
    expect(fileSummary("movies")).toMatchObject({ files: 0, pending: true });
    expect(fileSummary("shows")).toMatchObject({ titles: 0, pending: false });
  });

  it("splits files and bytes by group, resolution and codec, most files first", () => {
    library();
    expect(filesByGroup("movies")).toEqual([
      // Two files each: the larger first. FuN and fun are one group.
      { value: "GRP", files: 2, size: 45 },
      { value: "FuN", files: 2, size: 18 },
      { value: null, files: 1, size: 7 },
    ]);
    expect(filesByResolution("movies")).toEqual([
      { value: "1080p", files: 3, size: 23 },
      { value: "4K", files: 1, size: 40 },
      { value: "", files: 1, size: 7 },
    ]);
    expect(filesByCodec("movies").map((p) => [p.value, p.files])).toEqual([
      ["x265", 2],
      ["x264", 2],
      ["", 1],
    ]);
    // A file counts for each of its languages; untagged ones last.
    expect(filesByLanguage("movies")).toEqual([
      { value: "DE", files: 4, size: 63 },
      { value: "EN", files: 1, size: 10 },
      { value: "", files: 1, size: 7 },
    ]);
    // The episodes on their own; one's group comes from its folder.
    expect(filesByGroup("shows")).toEqual([
      { value: "cnhd", files: 1, size: 3 },
      { value: null, files: 1, size: 2 },
    ]);
  });

  it("searches titles and file names, umlauts either way", () => {
    library();
    expect(names({ words: ["brucke"] })).toEqual(["Die.Bruecke.1959.1080p.x264-GRP.mkv"]);
    expect(names({ words: ["bruecke", "1959"] })).toEqual(["Die.Bruecke.1959.1080p.x264-GRP.mkv"]);
    // A LIKE wildcard is just a character.
    expect(names({ words: ["%"] })).toEqual([]);
  });

  it("filters by group (any spelling, or none), resolution and codec", () => {
    library();
    expect(names({ groups: ["fun"] })).toEqual(["Alien.1979.1080p.x264-fun.mkv", "Heat.1995.1080p.x265-FuN.mkv"]);
    expect(names({ groups: ["GRP", null] })).toEqual([
      "Alien.1979.2160p.x265-GRP.mkv",
      "Brazil (1985).mkv",
      "Die.Bruecke.1959.1080p.x264-GRP.mkv",
    ]);
    expect(names({ resolutions: ["4K", ""] })).toEqual(["Alien.1979.2160p.x265-GRP.mkv", "Brazil (1985).mkv"]);
    expect(names({ codecs: ["x264"], groups: ["GRP"] })).toEqual(["Die.Bruecke.1959.1080p.x264-GRP.mkv"]);
  });

  it("filters by audio language: any of them, or none tagged", () => {
    library();
    expect(names({ languages: ["EN"] })).toEqual(["Heat.1995.1080p.x265-FuN.mkv"]);
    expect(names({ languages: ["EN", ""] })).toEqual(["Brazil (1985).mkv", "Heat.1995.1080p.x265-FuN.mkv"]);
    expect(names({ languages: ["DE"], codecs: ["x264"] })).toEqual([
      "Alien.1979.1080p.x264-fun.mkv",
      "Die.Bruecke.1959.1080p.x264-GRP.mkv",
    ]);
  });

  it("sorts by title (versions together), size, or group with files without one last", () => {
    library();
    expect(names({}, "size", false)[0]).toBe("Alien.1979.2160p.x265-GRP.mkv");
    expect(names({}, "group", true).at(-1)).toBe("Brazil (1985).mkv");
    expect(names({}, "group", false).at(-1)).toBe("Brazil (1985).mkv");
    expect(names({}, "title", false)[0]).toBe("Heat.1995.1080p.x265-FuN.mkv");
  });

  it("lists a show's episodes in order, findable by their number or title", () => {
    library();
    const shows = (f: Partial<FileFilters> = {}) => queryFiles("shows", filters(f), "title", true, 0, 50).items;
    expect(shows().map((r) => [r.season, r.episode, r.episodeTitle])).toEqual([
      [1, 1, "Episode 1"],
      [1, 2, "Episode 2"],
    ]);
    expect(shows({ words: ["s01e02"] }).map((r) => r.key)).toEqual(["e2:0"]);
    expect(shows({ words: ["episode", "1"] }).map((r) => r.key)).toEqual(["e1:0", "e2:0"]);
    expect(shows({ groups: [null] }).map((r) => r.key)).toEqual(["e2:0"]);
  });

  it("pages, counting every match", () => {
    library();
    const page = queryFiles("movies", filters(), "title", true, 2, 2);
    expect(page).toMatchObject({ matched: 5, items: [{ title: "Brazil" }, { title: "Die Brücke" }] });
    expect(page.items[0]).toEqual({
      key: "m4:0",
      title: "Brazil",
      year: 1985,
      tmdbId: null,
      season: null,
      episode: null,
      episodeEnd: null,
      episodeTitle: null,
      fileName: "Brazil (1985).mkv",
      group: null,
      size: 7,
      resolution: "",
      codec: "",
      languages: [],
    });
    // Past the last page there are no rows, but still a count.
    expect(queryFiles("movies", filters(), "title", true, 10, 2)).toEqual({ matched: 5, items: [] });
  });

  it("is replaced with the library at every sync", () => {
    library();
    replaceJellyfin({ movies: [], shows: [], episodes: [] }, null);
    expect(fileSummary("movies")).toMatchObject({ titles: 0, files: 0 });
    expect(fileSummary("shows")).toMatchObject({ titles: 0, files: 0 });
  });
});
