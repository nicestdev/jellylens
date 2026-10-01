import { describe, expect, it } from "vitest";
import { storedFiles, type MediaItem } from "@/lib/analytics";
import { movie, show } from "@/test/fixtures";
import type { Release } from "../xrel";
import {
  addGroup,
  insertReleases,
  libraryReleases,
  markGroupSynced,
  ownedFiles,
  replaceJellyfin,
  saveTitleMatch,
  setPreferences,
  upgradeGroups,
} from ".";

const release = (id: string, name: string, over: Partial<Release> = {}): Release => ({
  id,
  name,
  link: `https://www.xrel.to/p2p/${id}`,
  type: "movie",
  quality: "HD-1080p",
  publishedAt: 1000,
  sizeMb: 9000,
  titleKey: "t-" + id,
  ...over,
});

function library() {
  const items: MediaItem[] = [
    {
      kind: "movie",
      id: "m1",
      parentId: "m1",
      title: "Heat",
      year: 1995,
      tmdbId: "949",
      files: [{ Name: "Heat.1995.German.1080p.BluRay.x264-w00t.mkv", Size: 8, Codec: "h264", Width: 1920, Languages: ["DE"] }],
    },
    {
      kind: "episode",
      id: "e1",
      parentId: "s1",
      title: "Silo",
      year: 2023,
      tmdbId: "125988",
      season: 1,
      episode: 2,
      files: [{ Name: "Silo.S01E02.German.DL.1080p.WEB.h264-FuN.mkv", Size: 3, Codec: "h264", Width: 1920 }],
    },
  ];
  replaceJellyfin(
    {
      movies: [movie({ Id: "m1", Name: "Heat", ImageTags: { Primary: "heat-tag" } })],
      shows: [show({ Id: "s1", Name: "Silo" })],
      episodes: [],
      files: storedFiles(items),
    },
    "2026-10-01T00:00:00.000Z"
  );
}

const entry = (mediaType: "movie" | "tv", tmdbId: number, title: string) => ({
  mediaType,
  tmdbId,
  title,
  originalTitle: title,
  year: null,
  posterPath: null,
});

describe("upgrades", () => {
  it("reads each library's files with their posters", () => {
    library();
    expect(ownedFiles("movies")).toEqual([
      {
        parentId: "m1",
        title: "Heat",
        year: 1995,
        tmdbId: "949",
        imageTag: "heat-tag",
        season: null,
        episode: null,
        episodeEnd: null,
        fileName: "Heat.1995.German.1080p.BluRay.x264-w00t.mkv",
        size: 8,
        group: "w00t",
        resolution: "1080p",
        codec: "x264",
        languages: ["DE"],
      },
    ]);
    expect(ownedFiles("shows")).toEqual([expect.objectContaining({ parentId: "s1", season: 1, episode: 2, imageTag: null, group: "FuN" })]);
  });

  it("finds the favorites' releases of what the library has, by its checked TMDB match", () => {
    library();
    addGroup("g1", "VECTOR");
    insertReleases("g1", [
      release("1", "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR"),
      release("2", "Heat.1995.German.XviD-VECTOR", { quality: "XviD", titleKey: "t-1" }),
      release("3", "Alien.1979.German.DL.1080p.BluRay.x264-VECTOR"),
      release("4", "Silo.2023.S01.German.DL.1080p.WEB.H264-VECTOR", { type: "tv", sizeMb: undefined }),
    ]);
    saveTitleMatch("t-1", "verified", entry("movie", 949, "Heat"), { title: "Heat", year: 1995 });
    saveTitleMatch("t-3", "verified", entry("movie", 348, "Alien"), { title: "Alien", year: 1979 });
    saveTitleMatch("t-4", "verified", entry("tv", 125988, "Silo"), { title: "Silo", year: 2023 });

    // Alien isn't in the library; the XviD is SD, hidden.
    expect(libraryReleases("movies")).toEqual([
      { tmdbId: 949, group: "VECTOR", name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR", quality: "HD-1080p", sizeMb: 9000, publishedAt: 1000 },
    ]);
    expect(libraryReleases("shows")).toEqual([expect.objectContaining({ tmdbId: 125988, sizeMb: null })]);
    setPreferences({ showSdReleases: true });
    expect(libraryReleases("movies")).toHaveLength(2);
  });

  it("lists the favorites, and whether a sync still has sizes to fill in", () => {
    addGroup("g2", "VECTOR");
    addGroup("g1", "FuN");
    expect(upgradeGroups()).toEqual({ favorites: ["VECTOR", "FuN"], sizesPending: true });
    markGroupSynced("g1", "2026-10-01T00:00:00Z");
    markGroupSynced("g2", "2026-10-01T00:00:00Z");
    expect(upgradeGroups()).toEqual({ favorites: ["VECTOR", "FuN"], sizesPending: false });
  });
});
