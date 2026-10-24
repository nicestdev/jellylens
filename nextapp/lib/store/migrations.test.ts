import { expect, it } from "vitest";
import { replaceFiles, type StoredFile } from "./files";
import { addDloadThreads, addDloadUser } from "./dload";
import { migrationRows, migrationTargets, seasonsOf } from "./migrations";
import { run } from "./sql";

const file = (f: Partial<StoredFile>): StoredFile => ({
  kind: "movie",
  itemId: "1",
  idx: 0,
  parentId: "1",
  title: "Heat",
  year: 1995,
  tmdbId: "949",
  season: null,
  episode: null,
  episodeEnd: null,
  episodeTitle: null,
  fileName: "Heat.1995.mkv",
  path: "nvme01/movies/Heat.1995.mkv",
  size: 1000,
  group: "VECTOR",
  groupKey: "vector",
  resolution: "1080p",
  codec: "x265",
  languages: [],
  search: "",
  ...f,
});
const ep = (season: number, episode: number, group: string) =>
  file({
    kind: "episode",
    itemId: `7:${season}:${episode}`,
    parentId: "7",
    title: "Arrow",
    year: 2012,
    tmdbId: "1412",
    season,
    episode,
    group,
    groupKey: group.toLowerCase(),
  });
// An uploader on DLoad, whose threads go by their name when no title ends
// in a group.
const uploader = (name = "w00t", id = 1) => addDloadUser(id, name);
const thread = (id: number, type: "movie" | "tv", tmdbId: number, seasons: number[] = []) => ({
  id,
  userId: 1,
  title: `thread ${id}`,
  postedAt: "2026-10-01T00:00:00.000Z",
  type,
  tmdbId,
  imdbId: null,
  seasons,
});

it("lists what the library has of an uploader's titles from others", () => {
  replaceFiles([
    file({}),
    file({ itemId: "2", title: "Alien", tmdbId: "348", group: "w00t", groupKey: "w00t" }),
    file({ itemId: "3", title: "Not his", tmdbId: "5" }),
    ep(1, 1, "w00t"),
    ep(2, 1, "WAREZCX"),
    ep(2, 2, "w00t"),
    ep(3, 1, "FuN"),
  ]);
  uploader();
  addDloadThreads([thread(1, "movie", 949), thread(2, "movie", 348), thread(3, "tv", 1412, [1, 2])]);
  const rows = migrationRows().filter((r) => r.target === "w00t" && r.kind === "replace");
  expect(rows.map((r) => [r.title, r.season, r.groups, r.size, r.episodes])).toEqual([
    ["Heat", null, ["VECTOR"], 1000, null],
    ["Arrow", 2, ["WAREZCX"], 1000, 1],
  ]);
  expect(rows.map((r) => r.have)).toEqual([
    [{ name: "Heat.1995", size: 1000, links: [] }],
    [{ name: "Arrow.S02.Heat.1995", size: 1000, links: [] }],
  ]);
  expect(rows[0].offers).toEqual([
    {
      name: "thread.1",
      links: [{ label: "DLoad", href: "https://dload.test/threads/1/" }],
      size: null,
      whole: false,
    },
  ]);
});

it("gives every movie and season without a row of any target a none row", () => {
  replaceFiles([file({}), file({ itemId: "2", title: "Alien", tmdbId: "348" }), ep(1, 1, "FuN")]);
  uploader();
  addDloadThreads([thread(1, "movie", 949)]);
  expect(
    migrationRows()
      .filter((r) => r.kind === "none")
      .map((r) => [r.title, r.season, r.target, r.offers]),
  ).toEqual([
    ["Alien", null, "", []],
    ["Arrow", 1, "", []],
  ]);
});

it("links the library's files of an uploader's group to their thread of that resolution", () => {
  replaceFiles([file({ group: "w00t", groupKey: "w00t", resolution: "4K", fileName: "Heat.1995.mkv" })]);
  uploader();
  addDloadThreads([
    { ...thread(1, "movie", 949), title: "Heat 1995 GERMAN 1080p BluRay" },
    { ...thread(2, "movie", 949), title: "Heat 1995 GERMAN 2160p WEB" },
  ]);
  const [row] = migrationRows().filter((r) => r.kind === "upgrade" || r.kind === "none");
  expect(row.have[0].links).toEqual([{ label: "DLoad", href: "https://dload.test/threads/2/" }]);
});

it("lists what the library has of an uploader's as WEB while their thread is a BluRay of its resolution", () => {
  const his = (f: Partial<StoredFile>) => file({ group: "w00t", groupKey: "w00t", ...f });
  replaceFiles([
    his({ fileName: "Heat.1995.GERMAN.AAC.1080p.WEB.x265-w00t.mkv" }),
    his({ itemId: "2", title: "Alien", tmdbId: "348", fileName: "Alien.1979.GERMAN.AAC.1080p.WEB.x265-w00t.mkv" }),
    his({ itemId: "3", title: "Ran", tmdbId: "11645", fileName: "Ran.1985.GERMAN.AAC.1080p.BluRay.x265-w00t.mkv" }),
    his({
      itemId: "5",
      title: "The Office",
      tmdbId: "2316",
      fileName: "The.Office.S04E03.Das.World.Wide.Web.GERMAN.AC3D.720p.BluRay.x265-w00t.mkv",
    }),
    his({
      itemId: "4",
      title: "Thor",
      tmdbId: "284053",
      resolution: "4K",
      fileName: "Thor.2017.GERMAN.AAC.2160p.WEB.x265-w00t.mkv",
    }),
  ]);
  uploader();
  addDloadThreads([
    { ...thread(1, "movie", 949), title: "Heat 1995 GERMAN AAC 1080p BluRay x265 - w00t" },
    { ...thread(2, "movie", 348), title: "Alien 1979 GERMAN AAC 1080p WEB x265 - w00t" },
    { ...thread(3, "movie", 11645), title: "Ran 1985 GERMAN AAC 1080p BluRay x265 - w00t" },
    { ...thread(5, "movie", 2316), title: "The Office GERMAN AC3D 720p BluRay x265 - w00t" },
    { ...thread(4, "movie", 284053), title: "Thor 2017 GERMAN AAC 1080p BluRay x265 - w00t" },
  ]);
  expect(
    migrationRows()
      .filter((r) => r.target === "w00t" && r.kind === "upgrade")
      .map((r) => [r.title, r.groups, r.offers[0].name]),
  ).toEqual([["Heat", ["w00t"], "Heat.1995.GERMAN.AAC.1080p.BluRay.x265-w00t"]]);
});

it("offers a favorite group's xREL releases matched to TMDB, FuN's with FunXD too", () => {
  run("INSERT INTO release_groups (id, kind, name, added_at) VALUES ('g1', 'p2p', 'FuN', '2026-10-01')");
  const release = (id: string, name: string, titleKey: string) =>
    run(
      `INSERT INTO releases (id, group_id, title_key, name, link, type, quality, published_at, search)
       VALUES (?, 'g1', ?, ?, ?, 'tv', 'HD-1080p', 1, '')`,
      id,
      titleKey,
      name,
      `https://www.xrel.to/tv-nfo/${id}.html`,
    );
  release("r1", "Arrow.S02.German.AC3.DL.1080p.Web.x265-FuN", "t1");
  release("r2", "Arrow.S03.German.AC3.DL.1080p.BluRay.x265-FuN", "t1");
  run(
    `INSERT INTO title_matches (title_key, status, media_type, tmdb_id, title, search, checked_at)
     VALUES ('t1', 'verified', 'tv', 1412, 'Arrow', '', '2026-10-01')`,
  );
  replaceFiles([
    ep(2, 1, "WAREZCX"),
    ep(3, 1, "FuN"),
    { ...ep(3, 2, "FuN"), fileName: "Arrow.S03E02.German.AC3.DL.1080p.Web.x265-FuN.mkv" },
  ]);
  const fun = migrationTargets().find((t) => t.name === "FuN")!;
  expect(migrationTargets().map((t) => t.name)).toEqual(["FuN"]);
  const [row] = migrationRows().filter((r) => r.target === fun.name && r.kind === "replace");
  expect([row.season, row.groups, row.offers[0].name]).toEqual([
    2,
    ["WAREZCX"],
    "Arrow.S02.German.AC3.DL.1080p.Web.x265-FuN",
  ]);
  expect(row.offers[0].links.map((l) => l.label)).toEqual(["xREL", "FunXD"]);
  expect(
    migrationRows()
      .filter((r) => r.target === fun.name && r.kind === "upgrade")
      .map((r) => [r.season, r.episodes]),
  ).toEqual([[3, 1]]);
});

it("reads a release name's seasons", () => {
  expect(seasonsOf("Arrow.S01-S03.German.1080p-GRP")).toEqual([1, 2, 3]);
  expect(seasonsOf("Arrow.S02E05.German.1080p-GRP")).toEqual([2]);
  expect(seasonsOf("Heat.1995.German.1080p-GRP")).toEqual([]);
});

it("gives an uploader's thread their group's xREL release's link and size when both have it", () => {
  run("INSERT INTO release_groups (id, kind, name, added_at) VALUES ('w', 'p2p', 'w00t', '2026-10-01')");
  run(
    `INSERT INTO releases (id, group_id, title_key, name, link, type, quality, published_at, search, size_mb)
     VALUES ('r1', 'w', 't1', 'Heat.1995.GERMAN.1080p.BluRay.x265-w00t', 'https://www.xrel.to/r1', 'movie', 'HD-1080p', 1, '', 2000),
            ('r2', 'w', 't1', 'Heat.1995.GERMAN.720p.BluRay.x265-w00t', 'https://www.xrel.to/r2', 'movie', 'HD-720p', 1, '', NULL)`,
  );
  run(
    `INSERT INTO title_matches (title_key, status, media_type, tmdb_id, title, search, checked_at)
     VALUES ('t1', 'verified', 'movie', 949, 'Heat', '', '2026-10-01')`,
  );
  replaceFiles([file({})]);
  uploader();
  addDloadThreads([{ ...thread(1, "movie", 949), title: "Heat 1995 GERMAN 1080p BluRay x265 - w00t" }]);
  const [row] = migrationRows().filter((r) => r.target === "w00t");
  expect(row.offers.map((o) => [o.name, o.links.map((l) => l.label), o.size])).toEqual([
    ["Heat.1995.GERMAN.1080p.BluRay.x265-w00t", ["DLoad", "xREL"], 2000 * 1024 * 1024],
    ["Heat.1995.GERMAN.720p.BluRay.x265-w00t", ["xREL"], null],
  ]);
});

it("names an uploader's target by the group most of their threads end with, before the favorite groups", () => {
  run("INSERT INTO release_groups (id, kind, name, added_at) VALUES ('g1', 'p2p', 'GRP', '2026-10-01')");
  run("INSERT INTO release_groups (id, kind, name, added_at) VALUES ('g2', 'p2p', 'FuN', '2026-10-01')");
  uploader("someone");
  uploader("newcomer", 2);
  addDloadThreads([
    { ...thread(1, "movie", 949), title: "Heat 1995 GERMAN 1080p - GRP" },
    { ...thread(2, "movie", 348), title: "Alien 1979 GERMAN 1080p - GRP" },
    { ...thread(3, "movie", 5), title: "Ran 1985 GERMAN 1080p - OTHER" },
    { ...thread(4, "movie", 6), title: "Thor 2017 GERMAN 1080p" },
  ]);
  expect(migrationTargets().map((t) => t.name)).toEqual(["newcomer", "GRP", "FuN"]);
});
