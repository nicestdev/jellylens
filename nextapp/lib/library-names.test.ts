import { describe, expect, it } from "vitest";
import { isLibraryFile, isVideo, libraryFolderName, releaseFileNames, seasonFolder, seasonOf } from "./library-names";

const movie = (title: string, year: number | null = 2001) => ({ title, year, tmdbId: 1 });

describe("libraryFolderName", () => {
  it("is TMDB's title as TMDB writes it, with the year and id", () => {
    expect(libraryFolderName(movie("RoboCop", 1987))).toBe("RoboCop (1987) [tmdbid-1]");
    expect(libraryFolderName(movie("Ocean's Eleven"))).toBe("Ocean's Eleven (2001) [tmdbid-1]");
    expect(libraryFolderName(movie("Batman v Superman", 2016))).toBe("Batman v Superman (2016) [tmdbid-1]");
    expect(libraryFolderName(movie("Untitled", null))).toBe("Untitled [tmdbid-1]");
  });

  it("turns : into ' -' and a censored F*** back into the word", () => {
    expect(libraryFolderName(movie("Mission: Impossible"))).toBe("Mission - Impossible (2001) [tmdbid-1]");
    expect(libraryFolderName(movie("The End of the F***ing World"))).toBe(
      "The End of the Fucking World (2001) [tmdbid-1]",
    );
  });

  it("leaves out what a file name can't have, and control characters; spaces made one", () => {
    expect(libraryFolderName(movie('V/H/S/94 "Cut"?'))).toBe("VHS94 Cut (2001) [tmdbid-1]");
    expect(libraryFolderName(movie("Tab\there\u0007  twice"))).toBe("Tab here twice (2001) [tmdbid-1]");
  });

  it("cuts a title too long for 255 bytes, keeping the year and id whole", () => {
    const name = libraryFolderName(movie("Ä".repeat(300), 2020));
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(255);
    expect(name.endsWith(" (2020) [tmdbid-1]")).toBe(true);
  });
});

describe("releaseFileNames", () => {
  const release = "Heat.1995.German.DL.1080p.BluRay.x265-VECTOR";

  it("names a video with spaces, and what starts like it, by the release", () => {
    expect(releaseFileNames(["Heat (1995).mkv", "Heat (1995).de.srt", "other.srt"], release)).toEqual([
      `${release}.mkv`,
      `${release}.de.srt`,
      "other.srt",
    ]);
  });

  it("keeps names as they are without spaces, with several videos, or a release with spaces", () => {
    expect(releaseFileNames(["Heat.1995.mkv"], release)).toEqual(["Heat.1995.mkv"]);
    expect(releaseFileNames(["A one.mkv", "B two.mkv"], release)).toEqual(["A one.mkv", "B two.mkv"]);
    expect(releaseFileNames(["Heat (1995).mkv"], "Heat 1995")).toEqual(["Heat (1995).mkv"]);
  });
});

describe("files and seasons", () => {
  it("takes videos and subtitles, not samples", () => {
    expect(isLibraryFile("Heat.mkv")).toBe(true);
    expect(isLibraryFile("Subs/Heat.de.srt")).toBe(true);
    expect(isLibraryFile("Heat.nfo")).toBe(false);
    expect(isLibraryFile("Sample/heat-sample.mkv")).toBe(false);
    expect(isVideo("Heat.mkv")).toBe(true);
    expect(isVideo("Heat.srt")).toBe(false);
  });

  it("reads the season from the file, else the package", () => {
    expect(seasonOf("Show.S02E03.mkv", "Show.S01.German")).toBe(2);
    expect(seasonOf("Folge 3.mkv", "Show.S01.German")).toBe(1);
    expect(seasonOf("Folge 3.mkv", "Show.German")).toBeNull();
    expect(seasonFolder(3)).toBe("Season 03");
  });
});
