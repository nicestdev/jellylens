import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { LIBRARY_DIR } from "./env";
import { scanLibrary } from "./library-scan";
import { getEpisodes, getMovies, getProbes, getShows } from "./store";
import { all } from "./store/sql";
import { json, mockFetch } from "@/test/http";

// The library's disks in a throwaway folder; ffprobe answers by the file's
// name ("2160p" in it: 4K, else 1080p).
vi.mock("./env", async (importOriginal) => {
  const os = await import("node:os");
  const fsp = await import("node:fs");
  const p = await import("node:path");
  return {
    ...(await importOriginal<typeof import("./env")>()),
    LIBRARY_DIR: fsp.mkdtempSync(p.join(os.tmpdir(), "jellylens-library-")),
  };
});
const probe = vi.hoisted(() => ({
  ffprobe: vi.fn(async (file: string) => ({
    seconds: 6000,
    codec: "hevc",
    width: file.includes("2160p") ? 3840 : 1920,
    height: file.includes("2160p") ? 1600 : 800,
    languages: ["DE", "EN"],
  })),
}));
vi.mock("./ffprobe", () => probe);

afterEach(() => {
  for (const entry of fs.readdirSync(LIBRARY_DIR)) fs.rmSync(path.join(LIBRARY_DIR, entry), { recursive: true });
  probe.ffprobe.mockClear();
});
afterAll(() => fs.rmSync(LIBRARY_DIR, { recursive: true, force: true }));

const TMDB = { apiKey: "key", language: "de-DE" };

function write(rel: string, content = "video") {
  const file = path.join(LIBRARY_DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const HEAT = "movies/Heat (1995) [tmdbid-949]";
const SILO = "shows/Silo (2023) [tmdbid-125988]";

// Heat on two disks (with a trailer and extras that don't count), Silo
// with a multi-episode file, a second version and a file without SxxEyy,
// and a folder without a TMDB id.
function library() {
  write(`nvme01/${HEAT}/Heat.1995.German.DL.1080p.BluRay.x265-FuN.mkv`, "1080p");
  write(`nvme01/${HEAT}/Heat-trailer.mkv`);
  write(`nvme01/${HEAT}/Extras/Making of.mkv`);
  write(`nvme01/${HEAT}/sample.mkv`);
  write(`nvme01/${HEAT}/Heat.nfo`);
  write(`nvme02/${HEAT}/Heat.1995.2160p.UHD.x265-W4K.mkv`, "2160p video");
  write(`nvme02/${SILO}/Season 01/Silo.S01E01.German.1080p.WEB.h264-GRP.mkv`);
  write(`nvme02/${SILO}/Season 01/Silo.S01E01.German.2160p.WEB.h265-GRP.mkv`);
  write(`nvme02/${SILO}/Season 01/Silo.S01E02-E03.German.1080p.WEB.h264-GRP.mkv`);
  write(`nvme02/${SILO}/Season 01/Silo.Making.of.mkv`);
  write("nvme02/movies/Some Movie (2000)/Some.Movie.mkv");
}

function tmdb() {
  return mockFetch((url) => {
    if (url.pathname === "/3/movie/949")
      return json({
        title: "Heat",
        release_date: "1995-12-15",
        genres: [{ name: "Krimi" }, { name: "Drama" }],
        poster_path: "/heat.jpg",
        belongs_to_collection: null,
      });
    if (url.pathname === "/3/tv/125988")
      return json({
        name: "Silo",
        first_air_date: "2023-05-04",
        genres: [{ name: "Drama" }],
        poster_path: "/silo.jpg",
        status: "Returning Series",
      });
  });
}

describe("scanLibrary", () => {
  it("reads every disk's titles, a title on several disks as one", async () => {
    library();
    tmdb();
    const result = await scanLibrary(TMDB);
    expect(result).toMatchObject({ movies: 1, shows: 1, episodes: 2, untagged: 1, unnamed: 1, tmdbFailed: 0 });

    expect(getMovies()).toEqual([
      {
        Id: "949",
        Name: "Heat",
        ProductionYear: 1995,
        ProviderIds: { Tmdb: "949" },
        PosterPath: "/heat.jpg",
        Genres: ["Krimi", "Drama"],
        Disks: ["nvme01", "nvme02"],
        Width: 1920,
        Height: 800,
        RunTimeTicks: 60_000_000_000,
        FileName: "Heat.1995.German.DL.1080p.BluRay.x265-FuN.mkv",
        AudioLanguages: ["DE", "EN"],
      },
    ]);
    expect(getShows()).toEqual([
      expect.objectContaining({
        Id: "125988",
        Name: "Silo",
        Status: "Continuing",
        ChildCount: 1,
        RecursiveItemCount: 2,
        PosterPath: "/silo.jpg",
      }),
    ]);
    expect(getEpisodes().map((e) => [e.Id, e.SeriesId, e.ParentIndexNumber, e.IndexNumber, e.IndexNumberEnd])).toEqual([
      ["125988:1:1", "125988", 1, 1, null],
      ["125988:1:2-3", "125988", 1, 2, 3],
    ]);

    // Every version a file of its own, with where it is.
    expect(
      all("SELECT item_id AS id, idx, path, resolution FROM media_files ORDER BY kind DESC, item_id, idx"),
    ).toEqual([
      {
        id: "949",
        idx: 0,
        path: `nvme01/${HEAT}/Heat.1995.German.DL.1080p.BluRay.x265-FuN.mkv`,
        resolution: "1080p",
      },
      { id: "949", idx: 1, path: `nvme02/${HEAT}/Heat.1995.2160p.UHD.x265-W4K.mkv`, resolution: "4K" },
      {
        id: "125988:1:1",
        idx: 0,
        path: `nvme02/${SILO}/Season 01/Silo.S01E01.German.1080p.WEB.h264-GRP.mkv`,
        resolution: "1080p",
      },
      {
        id: "125988:1:1",
        idx: 1,
        path: `nvme02/${SILO}/Season 01/Silo.S01E01.German.2160p.WEB.h265-GRP.mkv`,
        resolution: "4K",
      },
      {
        id: "125988:1:2-3",
        idx: 0,
        path: `nvme02/${SILO}/Season 01/Silo.S01E02-E03.German.1080p.WEB.h264-GRP.mkv`,
        resolution: "1080p",
      },
    ]);
  });

  it("probes a file once, again when it changes, and forgets one that's gone", async () => {
    library();
    tmdb();
    await scanLibrary(TMDB);
    expect(probe.ffprobe).toHaveBeenCalledTimes(6);

    probe.ffprobe.mockClear();
    write(`nvme01/${HEAT}/Heat.1995.German.DL.1080p.BluRay.x265-FuN.mkv`, "1080p, re-encoded");
    fs.rmSync(path.join(LIBRARY_DIR, `nvme02/${HEAT}/Heat.1995.2160p.UHD.x265-W4K.mkv`));
    await scanLibrary(TMDB);
    expect(probe.ffprobe).toHaveBeenCalledTimes(1);
    expect(getProbes().size).toBe(5);
    expect(getMovies()[0].Disks).toEqual(["nvme01"]);
  });

  it("asks TMDB about a title once", async () => {
    library();
    const fetch = tmdb();
    await scanLibrary(TMDB);
    await scanLibrary(TMDB);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("names titles by their folders without TMDB", async () => {
    library();
    await scanLibrary(null);
    expect(getMovies()[0]).toMatchObject({ Name: "Heat", ProductionYear: 1995, PosterPath: null, Genres: [] });
  });

  it("refuses a library without title folders", async () => {
    write("nvme01/movies/Some Movie (2000)/Some.Movie.mkv");
    await expect(scanLibrary(null)).rejects.toThrow(/No title folders/);
  });
});
