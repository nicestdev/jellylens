import { describe, expect, it } from "vitest";
import { db } from "./db";
import { libraryOf } from "./download-library";
import { addPackage, getPackage, listFiles, setInnerName, setPackageMedia, type DownloadMedia } from "./store";

// A file of the library's (a row of media_files, what libraryCopies reads).
let idx = 0;
function copy(
  kind: "movie" | "episode",
  tmdbId: number,
  over: {
    season?: number;
    episode?: number;
    episodeEnd?: number;
    resolution?: string;
    codec?: string;
    group?: string;
    fileName?: string;
    disk?: string;
  },
) {
  db()
    .prepare(
      `INSERT INTO media_files (kind, item_id, idx, parent_id, title, tmdb_id, season, episode, episode_end,
         file_name, path, size, grp, resolution, codec, languages, search)
       VALUES (?, ?, ?, 'p', 'T', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, '[]', 't')`,
    )
    .run(
      kind,
      `item${++idx}`,
      0,
      String(tmdbId),
      over.season ?? null,
      over.episode ?? null,
      over.episodeEnd ?? null,
      over.fileName ?? "f.mkv",
      `${over.disk ?? "nvme01"}/${kind === "movie" ? "movies" : "shows"}/T/${over.fileName ?? "f.mkv"}`,
      over.group ?? null,
      over.resolution ?? "",
      over.codec ?? "",
    );
}

// A package matched to a TMDB entry, with files by these names.
function pkg(name: string, files: string[], media: Partial<DownloadMedia> | null = { type: "tv", tmdbId: 7 }) {
  const id = addPackage({
    name,
    dir: name,
    files: files.map((f) => ({ url: `https://example.com/${f}`, name: f, size: 1 })),
  });
  if (media) setPackageMedia(id, { type: "tv", tmdbId: 7, title: "Silo", year: 2023, posterPath: null, ...media });
  return { pkg: getPackage(id)!, files: listFiles(id) };
}

const ids = (files: { id: number; name: string }[], owned: Set<number>) =>
  files.filter((f) => owned.has(f.id)).map((f) => f.name);

describe("libraryOf", () => {
  it("is nothing for a package not matched to TMDB", () => {
    const { pkg: p, files } = pkg("Heat.1995", ["a.mkv"], null);
    expect(libraryOf(p, files)).toEqual({ library: null, owned: new Set() });
  });

  it("offers Replace for another version of a movie, its files the old, the release the new", () => {
    copy("movie", 949, { fileName: "Heat.720p-OLD.mkv", disk: "nvme03" });
    copy("movie", 949, { fileName: "Heat.2160p-UHD.mkv" });
    copy("movie", 950, { fileName: "Other.mkv" });
    const { pkg: p, files } = pkg("Heat.1995.German.DL.1080p.BluRay.x264-VECTOR - uploader", ["Heat.part1.rar"], {
      type: "movie",
      tmdbId: 949,
    });
    expect(libraryOf(p, files)).toEqual({
      library: {
        old: ["nvme01/movies/T/Heat.2160p-UHD.mkv", "nvme03/movies/T/Heat.720p-OLD.mkv"],
        new: ["Heat.1995.German.DL.1080p.BluRay.x264-VECTOR"],
        exact: false,
        skip: 1,
        choices: ["replace"],
        disks: ["nvme01", "nvme03"],
        presumed: [],
      },
      owned: new Set(),
    });
    const other = pkg("Ronin.1998", [], { type: "movie", tmdbId: 8195 });
    expect(libraryOf(other.pkg, other.files).library).toBeNull();
  });

  it("offers nothing but Remove for the very release of a movie you have", () => {
    copy("movie", 949, { fileName: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR.mkv" });
    const { pkg: p, files } = pkg("Heat.1995.German.DL.1080p.BluRay.x264-VECTOR", [], { type: "movie", tmdbId: 949 });
    expect(libraryOf(p, files).library).toMatchObject({ new: [], exact: true, choices: [] });
  });

  it("offers Replace for other versions of episodes, every one of the package's coming", () => {
    copy("episode", 7, { season: 1, episode: 1, fileName: "Silo.S01E01.Pilot.720p-OLD.mkv" });
    // One file with episodes 2 to 4.
    copy("episode", 7, { season: 1, episode: 2, episodeEnd: 4, fileName: "Silo.S01E02-E04.720p-OLD.mkv" });
    copy("episode", 7, { season: 2, episode: 1, fileName: "Silo.S02E01.mkv" });
    const { pkg: p, files } = pkg("Silo.S01.German.1080p-GRP", [
      "Silo.S01E01.German.1080p-GRP.part1.rar",
      "Silo.S01E01.German.1080p-GRP.part2.rar",
      "Silo1080S01E02E03.rar",
      "Silo1080S01E04-E05.rar",
      "Silo1080S01E05.rar",
      "Silo.S01.nfo",
    ]);
    const { library, owned } = libraryOf(p, files);
    expect(ids(files, owned)).toEqual([
      "Silo.S01E01.German.1080p-GRP.part1.rar",
      "Silo.S01E01.German.1080p-GRP.part2.rar",
      "Silo1080S01E02E03.rar",
    ]);
    expect(library).toEqual({
      old: ["nvme01/shows/T/Silo.S01E01.Pilot.720p-OLD.mkv", "nvme01/shows/T/Silo.S01E02-E04.720p-OLD.mkv"],
      new: [
        "Season 01/Silo.S01E01.German.1080p-GRP",
        "Season 01/Silo.S01E02-E03.German.1080p-GRP",
        "Season 01/Silo.S01E04-E05.German.1080p-GRP",
        "Season 01/Silo.S01E05.German.1080p-GRP",
      ],
      exact: false,
      skip: 3,
      choices: ["replace"],
      disks: ["nvme01"],
      presumed: [],
    });
  });

  it("offers Skip for episodes of the very release, only the missing coming, or nothing when all are there", () => {
    const mine = (e: number) =>
      copy("episode", 7, { season: 1, episode: e, fileName: `Silo.S01E0${e}.Titel.German.1080p-GRP.mkv` });
    mine(1);
    mine(2);
    const some = pkg("Silo.S01.German.1080p-GRP", ["Silo1080S01E01.rar", "Silo1080S01E02.rar", "Silo1080S01E03.rar"]);
    expect(libraryOf(some.pkg, some.files).library).toMatchObject({
      new: ["Season 01/Silo.S01E03.German.1080p-GRP"],
      exact: true,
      skip: 2,
      choices: ["skip"],
    });
    const all = pkg("Silo.S01.German.1080p-GRP", ["Silo1080S01E01.rar", "Silo1080S01E02.rar"]);
    expect(libraryOf(all.pkg, all.files).library).toMatchObject({ new: [], exact: true, choices: [] });
  });

  it("goes by the first archive's real name when it has one: its episode proven, the rest only presumed", () => {
    const mine = (e: number) =>
      copy("episode", 7, { season: 1, episode: e, fileName: `Silo.S01E0${e}.Titel.German.AAC.1080p.WEB-GRP.mkv` });
    mine(1);
    mine(2);
    // The package's name says another release than the archives hold.
    const a = pkg("Silo.S01.German.AACD.1080p.BluRay-GRP", ["Silo1080S01E01.rar", "Silo1080S01E02.rar"]);
    expect(libraryOf(a.pkg, a.files).library).toMatchObject({ exact: false, choices: ["replace"] });
    setInnerName(a.files[0].id, "Silo.S01E01.Titel.German.AAC.1080p.WEB-GRP.mkv");
    const found = libraryOf(a.pkg, listFiles(a.pkg.id)).library;
    expect(found).toMatchObject({ new: [], exact: true, choices: [] });
    expect(found?.presumed).toEqual(["nvme01/shows/T/Silo.S01E02.Titel.German.AAC.1080p.WEB-GRP.mkv"]);
    // The first archive holds another version: Replace, nothing presumed.
    const b = pkg("Silo.S01.German.AAC.1080p.WEB-GRP", ["Silo1080S01E01.rar", "Silo1080S01E02.rar"]);
    setInnerName(b.files[0].id, "Silo.S01E01.Titel.German.AAC.2160p.WEB-OTHER.mkv");
    expect(libraryOf(b.pkg, listFiles(b.pkg.id)).library).toMatchObject({
      exact: false,
      choices: ["replace"],
      presumed: [],
    });
  });

  it("is nothing for a show's episodes you don't have", () => {
    copy("episode", 7, { season: 2, episode: 1 });
    const { pkg: p, files } = pkg("Silo.S01", ["Silo.S01E01.mkv", "Silo.S01E02.mkv"]);
    expect(libraryOf(p, files)).toEqual({ library: null, owned: new Set() });
  });

  it("takes a season pack in one archive as its season, the pack the new, Skip for the very release", () => {
    copy("episode", 7, { season: 1, episode: 1, fileName: "Silo.S01E01.720p-OLD.mkv" });
    copy("episode", 7, { season: 1, episode: 2, fileName: "Silo.S01E02.720p-OLD.mkv" });
    copy("episode", 7, { season: 2, episode: 1 });
    const { pkg: p, files } = pkg("Silo.S01.German.DL.1080p.WEB.x264-GRP", ["silo.part1.rar", "silo.part2.rar"]);
    expect(libraryOf(p, files)).toEqual({
      library: {
        old: ["nvme01/shows/T/Silo.S01E01.720p-OLD.mkv", "nvme01/shows/T/Silo.S01E02.720p-OLD.mkv"],
        new: ["Season 01/Silo.S01.German.DL.1080p.WEB.x264-GRP"],
        exact: false,
        skip: 2,
        choices: ["replace"],
        disks: ["nvme01"],
        presumed: [],
      },
      owned: new Set(),
    });
    copy("episode", 8, { season: 1, episode: 1, fileName: "Silo.S01E01.Freedom.Day.German.DL.1080p.WEB.x264-GRP.mkv" });
    const own = pkg("Silo.S01.German.DL.1080p.WEB.x264-GRP", ["silo.part1.rar"], { tmdbId: 8 });
    expect(libraryOf(own.pkg, own.files).library).toMatchObject({ exact: true, choices: ["skip"] });
  });

  it("is nothing for a season pack of a season you don't have, or a name without a season", () => {
    copy("episode", 7, { season: 2, episode: 1 });
    const pack = pkg("Silo.S01.German.1080p", ["silo.part1.rar"]);
    expect(libraryOf(pack.pkg, pack.files).library).toBeNull();
    const plain = pkg("Silo.Complete.German", ["silo.part1.rar"]);
    expect(libraryOf(plain.pkg, plain.files).library).toBeNull();
  });
});
