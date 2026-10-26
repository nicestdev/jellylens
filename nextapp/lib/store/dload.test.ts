import { expect, it } from "vitest";
import { toRelease } from "../dload";
import {
  addDloadThreads,
  addDloadUser,
  dloadThreadsOf,
  dloadTmdbThreads,
  dloadUsers,
  hasDloadThread,
  removeDloadUser,
  renameDloadThread,
  replaceDloadReleases,
  unmatchedDloadTitles,
} from "./dload";
import { queryTitles, saveTitleMatch } from "./releases";

const thread = (id: number, userId: number, title: string) => ({
  id,
  userId,
  title,
  postedAt: `2026-10-0${id}T00:00:00.000Z`,
  type: "movie" as const,
  tmdbId: 949,
  imdbId: null,
  seasons: [],
});

it("lists the uploaders A→Z, each with their threads and the group most of them end with", () => {
  addDloadUser(2, "zed");
  addDloadUser(1, "anna");
  addDloadThreads([
    thread(1, 1, "Heat 1995 GERMAN 1080p - GRP"),
    thread(2, 1, "Heat 1995 GERMAN 720p - GRP"),
    thread(3, 1, "Heat 1995 GERMAN 2160p x265 GRP"),
  ]);
  expect(dloadUsers()).toEqual([
    { id: 1, name: "anna", group: "GRP", threads: 3 },
    { id: 2, name: "zed", group: "zed", threads: 0 },
  ]);
  // Added again: the name as the link has it now.
  addDloadUser(2, "zeta");
  expect(dloadUsers().map((u) => u.name)).toEqual(["anna", "zeta"]);
});

it("renames a thread only when its title changed, and drops an uploader's threads with them", () => {
  addDloadUser(1, "anna");
  addDloadThreads([thread(1, 1, "Heat 1995 GERMAN 1080p WEB - GRP")]);
  expect(renameDloadThread(1, "Heat 1995 GERMAN 1080p WEB - GRP", [])).toBe(false);
  expect(renameDloadThread(1, "Heat 1995 GERMAN 1080p BluRay - GRP", [])).toBe(true);
  expect(dloadThreadsOf("movie", 949)).toEqual([
    { id: 1, userId: 1, title: "Heat 1995 GERMAN 1080p BluRay - GRP", postedAt: "2026-10-01T00:00:00.000Z" },
  ]);
  removeDloadUser(1);
  expect(hasDloadThread(1)).toBe(false);
});

it("puts the threads on Discover as their group's releases, one tile with the TMDB title's", () => {
  addDloadUser(1, "anna");
  addDloadThreads([thread(1, 1, "Heat 1995 GERMAN 1080p - w00t"), { ...thread(2, 1, "Junk"), type: null }]);
  const sync = () => replaceDloadReleases(dloadTmdbThreads().map((t) => toRelease(t, "w00t")));
  sync();
  expect(unmatchedDloadTitles()).toEqual(["dload:movie:949"]);
  saveTitleMatch(
    "dload:movie:949",
    "verified",
    { mediaType: "movie", tmdbId: 949, title: "Heat", originalTitle: "Heat", year: 1995, posterPath: null },
    { title: "Heat", year: 1995 },
  );
  const w00t = () => queryTitles({ words: [], type: [], group: ["w00t"], library: [] }, "date", false, 0, 10).items;
  expect(w00t()).toMatchObject([{ key: "movie:949", title: "Heat", groups: ["w00t"], releases: 1 }]);
  // Written anew: a renamed thread replaces its old name.
  renameDloadThread(1, "Heat 1995 GERMAN 2160p - w00t", []);
  sync();
  expect(w00t()).toMatchObject([{ releases: 1, qualities: ["HD-2160p"] }]);
  removeDloadUser(1);
  expect(w00t()).toEqual([]);
});
