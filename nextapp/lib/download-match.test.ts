import { describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import { addPackage, listFiles, listPackages, setPackageMedia, updateFile } from "./store";
import {
  RECHECK_MS,
  checkPendingFiles,
  matchName,
  matchPendingPackages,
  mediaOfTmdb,
  onlineOf,
} from "./download-match";

// What runs in the background, waited for.
const g = globalThis as unknown as {
  __downloadMatching?: Promise<void> | null;
  __downloadChecking?: Promise<void> | null;
};
const settled = async () => {
  await g.__downloadMatching;
  await g.__downloadChecking;
};

// TMDB's movie search, as the Queue asks it for a package's name.
function tmdb(results: Record<string, unknown[]>) {
  return mockFetch((url) => {
    if (url.pathname === "/3/search/movie")
      return json({ results: results[url.searchParams.get("query") ?? ""] ?? [] });
  });
}

const mazeRunner = {
  id: 198663,
  title: "Maze Runner - Die Auserwählten im Labyrinth",
  original_title: "The Maze Runner",
  release_date: "2014-09-10",
  poster_path: "/maze.jpg",
};

describe("matchName", () => {
  it("searches again with umlauts when a German name spells them out", async () => {
    const fetch = tmdb({ "Maze Runner Die Auserwählten im Labyrinth": [mazeRunner] });
    expect(
      await matchName("Maze.Runner.Die.Auserwaehlten.im.Labyrinth.2014.German.EAC3.DL.1080p.BluRay.x265-VECTOR"),
    ).toEqual({
      type: "movie",
      tmdbId: 198663,
      title: "Maze Runner - Die Auserwählten im Labyrinth",
      year: 2014,
      posterPath: "/maze.jpg",
    });
    const queries = fetch.mock.calls
      .map(([u]) => new URL(String(u)))
      .filter((u) => u.pathname === "/3/search/movie")
      .map((u) => u.searchParams.get("query"));
    // With the year and without (TMDB may date it a year off), then with umlauts.
    expect(queries).toEqual([
      "Maze Runner Die Auserwaehlten im Labyrinth",
      "Maze Runner Die Auserwaehlten im Labyrinth",
      "Maze Runner Die Auserwählten im Labyrinth",
    ]);
  });

  it("finds a movie TMDB dates a year off, without the year, only one that fits", async () => {
    const inferno = {
      id: 156717,
      title: "Death Race: Inferno",
      original_title: "Death Race: Inferno",
      release_date: "2013-01-04",
    };
    const fetch = mockFetch((url) => {
      if (url.pathname !== "/3/search/movie") return undefined;
      return json({ results: url.searchParams.get("year") ? [] : [inferno] });
    });
    expect(await matchName("Death.Race.3.Inferno.2012.German.AC3.DL.1080p.BluRay.x265-FuN - funxd.site")).toMatchObject(
      {
        tmdbId: 156717,
        year: 2013,
      },
    );
    expect(fetch.mock.calls.length).toBe(2);
    expect(await matchName("Death.Race.3.Inferno.2016.German.AC3.DL.1080p.BluRay.x265-FuN")).toBeNull();
  });

  it("finds a first part without its 1, before taking a search's first hit", async () => {
    const twoCars = {
      id: 51896,
      title: "Two Cars, One Night",
      original_title: "Two Cars, One Night",
      release_date: "2004-06-09",
    };
    const knockOff = { id: 7, title: "Os Carrinhos", original_title: "Os Carrinhos", release_date: "2006-06-20" };
    const cars = { id: 920, title: "Cars", original_title: "Cars", release_date: "2006-06-08" };
    tmdb({ "Cars 1": [twoCars, knockOff], Cars: [cars] });
    expect(await matchName("Cars.1.2006.German.DL.AC3.1080p.BluRay.x265-FuN - funxd.site")).toMatchObject({
      tmdbId: 920,
      title: "Cars",
    });
    // Nothing fits anywhere: the name's own search's first hit within a year, not one two years off.
    tmdb({ "Cars 1": [twoCars, knockOff] });
    expect(await matchName("Cars.1.2006.German.DL.AC3.1080p.BluRay.x265-FuN")).toMatchObject({ tmdbId: 7 });
  });

  it("finds a sequel TMDB knows by another name as its first part's collection's part", async () => {
    const first = { id: 466282, title: "To All the Boys I've Loved Before", release_date: "2018-08-17" };
    const parts = [
      { id: 614409, title: "To All the Boys: Always and Forever", release_date: "2021-02-12", poster_path: "/3.jpg" },
      { ...first, poster_path: "/1.jpg" },
      {
        id: 565426,
        title: "To All the Boys: P.S. I Still Love You",
        release_date: "2020-02-12",
        poster_path: "/2.jpg",
      },
    ];
    const fetch = mockFetch((url) => {
      if (url.pathname === "/3/search/movie")
        return json({ results: url.searchParams.get("query") === "To All the Boys Ive Loved Before" ? [first] : [] });
      if (url.pathname === "/3/movie/466282") return json({ belongs_to_collection: { id: 1 } });
      if (url.pathname === "/3/collection/1") return json({ name: "To All the Boys", parts });
    });
    const name = "To.All.the.Boys.Ive.Loved.Before.2.2020.German.AC3.DL.1080p.WebRip.x265-FuN - funxd.site";
    expect(await matchName(name)).toEqual({
      type: "movie",
      tmdbId: 565426,
      title: "To All the Boys: P.S. I Still Love You",
      year: 2020,
      posterPath: "/2.jpg",
    });
    // A part that isn't within a year of the name's: not that one.
    expect(await matchName("To.All.the.Boys.Ive.Loved.Before.3.2015.German.1080p.WEB.x264-GRP")).toBeNull();
    // A show's number is no sequel's.
    fetch.mockClear();
    mockFetch((url) => (url.pathname === "/3/search/tv" ? json({ results: [] }) : undefined));
    expect(await matchName("Show.2.S01.German.1080p.WEB.x264-GRP")).toBeNull();
  });

  it("takes only a hit that fits from the search with umlauts", async () => {
    tmdb({ "Die Brücke": [{ ...mazeRunner, title: "Something Else", original_title: "Something Else" }] });
    expect(await matchName("Die.Bruecke.2008.German.1080p.BluRay.x264-GRP")).toBeNull();
  });
});

describe("matchPendingPackages", () => {
  const maze = "Maze.Runner.Die.Auserwaehlten.im.Labyrinth.2014.German.EAC3.DL.1080p.BluRay.x265-VECTOR";

  it("searches once for a package not looked up yet", async () => {
    addPackage({ name: maze, dir: "maze", files: [] });
    const fetch = tmdb({ "Maze Runner Die Auserwählten im Labyrinth": [mazeRunner] });

    matchPendingPackages();
    await settled();
    expect(listPackages()[0].media).toMatchObject({ tmdbId: 198663 });
    expect(fetch).toHaveBeenCalled();

    // Looked up: left alone, found or not.
    setPackageMedia(listPackages()[0].id, null);
    const fetch2 = mockFetch(() => undefined);
    matchPendingPackages();
    await settled();
    expect(fetch2).not.toHaveBeenCalled();
  });
});

describe("checkPendingFiles", () => {
  it("asks the hoster again about a file it didn't answer for, after a while", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const id = addPackage({
        name: "Heat",
        dir: "heat",
        files: [{ url: "https://ddownload.com/aaaaaaaaaaa1", name: "aaaaaaaaaaa1", size: null }],
      });
      let answer = "<html>busy</html>";
      const fetch = mockFetch((url) => (url.hostname === "ddownload.com" ? new Response(answer) : undefined));

      checkPendingFiles();
      await settled();
      checkPendingFiles();
      await settled();
      expect(fetch).toHaveBeenCalledTimes(1);

      answer = '<div class="dk-dl-name" title="Heat.part1.rar"></div><span class="dk-dl-size">1.5 GB</span>';
      vi.setSystemTime(Date.now() + RECHECK_MS);
      checkPendingFiles();
      await settled();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(listFiles(id)[0]).toMatchObject({ name: "Heat.part1.rar", size: 1610612736 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a file alone that started while the hoster was asked", async () => {
    const id = addPackage({
      name: "Heat",
      dir: "heat",
      files: [{ url: "https://ddownload.com/aaaaaaaaaaa1", name: "Heat.part1.rar", size: 1000 }],
    });
    const [file] = listFiles(id);
    mockFetch((url) => {
      if (url.hostname !== "ddownload.com") return undefined;
      // Start (Download all) while the check waits for the answer.
      updateFile(file.id, { status: "downloading", received: 10 });
      return new Response("<b>File Not Found</b>");
    });
    checkPendingFiles();
    await settled();
    expect(listFiles(id)[0]).toMatchObject({ status: "downloading", error: null });
  });

  it("asks about every new file once, its size known or not, like JDownloader's LinkGrabber", async () => {
    const id = addPackage({
      name: "Heat",
      dir: "heat",
      files: [
        { url: "https://ddownload.com/aaaaaaaaaaa1", name: "Heat.part1.rar", size: 1000 },
        { url: "https://ddownload.com/aaaaaaaaaaa2", name: "Heat.part2.rar", size: 1000 },
      ],
    });
    const [one] = listFiles(id);
    expect(onlineOf(one.id)).toBeNull();
    const fetch = mockFetch((url) =>
      url.hostname === "ddownload.com"
        ? new Response(
            url.pathname.endsWith("2")
              ? "<b>File Not Found</b>"
              : '<div class="dk-dl-name" title="Heat.part1.rar"></div><span class="dk-dl-size">1.5 GB</span>',
          )
        : undefined,
    );
    checkPendingFiles();
    await settled();
    expect(onlineOf(one.id)).toBe("online");
    // The size it came with stays.
    expect(listFiles(id)).toMatchObject([
      { size: 1000, status: "queued" },
      { status: "failed", error: "The hoster doesn't have it anymore" },
    ]);
    // Not asked again.
    checkPendingFiles();
    await settled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("mediaOfTmdb", () => {
  it("takes a TMDB page's link, kind:id, or a bare id as the package's kind", async () => {
    const fetch = mockFetch((url) => {
      const m = url.pathname.match(/^\/3\/(movie|tv)\/(\d+)$/);
      if (m) return json({ id: Number(m[2]), title: "Heat", name: "Silo", release_date: "1995-12-15" });
    });
    expect(await mediaOfTmdb("https://www.themoviedb.org/movie/949-heat?language=de", "x")).toEqual({
      type: "movie",
      tmdbId: 949,
      title: "Heat",
      year: 1995,
      posterPath: null,
    });
    expect(await mediaOfTmdb("tv:125988", "x")).toMatchObject({ type: "tv", tmdbId: 125988 });
    expect(await mediaOfTmdb(" 125988 ", "Silo.S01.German.1080p.WEB.x264-GRP")).toMatchObject({ type: "tv" });
    expect(await mediaOfTmdb("949", "Heat.1995.German.1080p.BluRay.x264-GRP")).toMatchObject({ type: "movie" });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(await mediaOfTmdb("Heat", "x")).toBeNull();
    // One TMDB doesn't have.
    mockFetch(() => json({}, { status: 404 }));
    expect(await mediaOfTmdb("movie:1", "x")).toBeNull();
  });
});
