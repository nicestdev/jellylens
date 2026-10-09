import { describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import { run } from "./store/sql";
import { addPackage, listFiles, listPackages, setPackageMedia } from "./store";
import { MATCHING_CHANGED, RECHECK_MS, checkPendingFiles, matchName, matchPendingPackages } from "./download-match";

// What runs in the background, waited for.
const g = globalThis as unknown as {
  __downloadMatching?: Promise<void> | null;
  __downloadChecking?: Promise<void> | null;
};
const settled = async () => {
  await g.__downloadMatching;
  await g.__downloadChecking;
};

// TMDB's movie search, as the Downloads page asks it for a package's name.
function tmdb(results: Record<string, unknown[]>) {
  return mockFetch((url) => {
    if (url.pathname === "/System/Configuration")
      return json({ PreferredMetadataLanguage: "de", MetadataCountryCode: "DE" });
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
    expect(queries).toEqual([
      "Maze Runner Die Auserwaehlten im Labyrinth",
      "Maze Runner Die Auserwählten im Labyrinth",
    ]);
  });

  it("takes only a hit that fits from the search with umlauts", async () => {
    tmdb({ "Die Brücke": [{ ...mazeRunner, title: "Something Else", original_title: "Something Else" }] });
    expect(await matchName("Die.Bruecke.2008.German.1080p.BluRay.x264-GRP")).toBeNull();
  });
});

describe("matchPendingPackages", () => {
  const maze = "Maze.Runner.Die.Auserwaehlten.im.Labyrinth.2014.German.EAC3.DL.1080p.BluRay.x265-VECTOR";

  it("searches again for a package found nothing for before the matching last changed, once", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(Date.parse(MATCHING_CHANGED) + 60_000) });
    const id = addPackage({ name: maze, dir: "maze", files: [] });
    setPackageMedia(id, null);
    run("UPDATE download_packages SET matched_at = ? WHERE id = ?", "2026-10-01T00:00:00.000Z", id);
    const fetch = tmdb({ "Maze Runner Die Auserwählten im Labyrinth": [mazeRunner] });

    matchPendingPackages();
    await settled();
    expect(listPackages()[0].media).toMatchObject({ tmdbId: 198663 });
    expect(fetch).toHaveBeenCalled();

    // Found nothing after the change: left alone.
    setPackageMedia(id, null);
    const fetch2 = mockFetch(() => undefined);
    matchPendingPackages();
    await settled();
    expect(fetch2).not.toHaveBeenCalled();
    vi.useRealTimers();
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
});
