import { describe, expect, it } from "vitest";
import { db } from "./db";
import { libraryOf } from "./download-library";
import { addPackage, getPackage, listFiles, setPackageMedia, type DownloadMedia } from "./store";

// A file of the library's (a row of media_files, what libraryCopies reads).
let idx = 0;
function copy(
  kind: "movie" | "episode",
  tmdbId: number,
  over: { season?: number; episode?: number; episodeEnd?: number; resolution?: string; codec?: string; group?: string },
) {
  db()
    .prepare(
      `INSERT INTO media_files (kind, item_id, idx, parent_id, title, tmdb_id, season, episode, episode_end,
         file_name, size, grp, resolution, codec, languages, search)
       VALUES (?, ?, ?, 'p', 'T', ?, ?, ?, ?, 'f.mkv', 1, ?, ?, ?, '[]', 't')`,
    )
    .run(
      kind,
      `item${++idx}`,
      0,
      String(tmdbId),
      over.season ?? null,
      over.episode ?? null,
      over.episodeEnd ?? null,
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

  it("lists your copies of a movie by quality, each once", () => {
    copy("movie", 949, { resolution: "1080p", codec: "x265", group: "FuN" });
    copy("movie", 949, { resolution: "1080p", codec: "x265", group: "FuN" });
    copy("movie", 949, { resolution: "2160p", codec: "", group: "" });
    copy("movie", 950, { resolution: "720p" });
    const { pkg: p, files } = pkg("Heat.1995", ["Heat.part1.rar"], { type: "movie", tmdbId: 949 });
    expect(libraryOf(p, files)).toEqual({
      library: { have: ["1080p · x265 · FuN", "2160p"], parts: 0, partsOwned: 0, season: null },
      owned: new Set(),
    });
  });

  it("says unknown quality for a copy without any, and nothing for a movie you don't have", () => {
    copy("movie", 949, {});
    const { pkg: p, files } = pkg("Heat.1995", [], { type: "movie", tmdbId: 949 });
    expect(libraryOf(p, files).library?.have).toEqual(["unknown quality"]);
    const other = pkg("Ronin.1998", [], { type: "movie", tmdbId: 8195 });
    expect(libraryOf(other.pkg, other.files).library).toBeNull();
  });

  it("marks the episodes you have, double episodes and ranges too", () => {
    copy("episode", 7, { season: 1, episode: 1, resolution: "1080p", group: "GRP" });
    // One file with episodes 2 to 4.
    copy("episode", 7, { season: 1, episode: 2, episodeEnd: 4, resolution: "720p" });
    copy("episode", 7, { season: 2, episode: 1, resolution: "2160p" });
    const { pkg: p, files } = pkg("Silo.S01.German.1080p", [
      "Silo.S01E01.mkv",
      "Silo.S01E02E03.mkv",
      "Silo.S01E04-E05.mkv",
      "Silo.S01E05.mkv",
      "Silo.S01.nfo",
    ]);
    const { library, owned } = libraryOf(p, files);
    expect(ids(files, owned)).toEqual(["Silo.S01E01.mkv", "Silo.S01E02E03.mkv"]);
    expect(library).toEqual({ have: ["1080p · GRP", "720p"], parts: 4, partsOwned: 2, season: null });
  });

  it("is nothing for a show's episodes you don't have", () => {
    copy("episode", 7, { season: 2, episode: 1 });
    const { pkg: p, files } = pkg("Silo.S01", ["Silo.S01E01.mkv", "Silo.S01E02.mkv"]);
    expect(libraryOf(p, files)).toEqual({ library: null, owned: new Set() });
  });

  it("counts a season pack's episodes you have, its parts not naming any", () => {
    copy("episode", 7, { season: 1, episode: 1, resolution: "1080p" });
    copy("episode", 7, { season: 1, episode: 2, resolution: "1080p" });
    copy("episode", 7, { season: 2, episode: 1, resolution: "720p" });
    const { pkg: p, files } = pkg("Silo.S01.German.DL.1080p.WEB.x264-GRP", ["silo.part1.rar", "silo.part2.rar"]);
    expect(libraryOf(p, files)).toEqual({
      library: { have: ["1080p"], parts: 0, partsOwned: 0, season: { number: 1, episodes: 2 } },
      owned: new Set(),
    });
  });

  it("is nothing for a season pack of a season you don't have, or a name without a season", () => {
    copy("episode", 7, { season: 2, episode: 1 });
    const pack = pkg("Silo.S01.German.1080p", ["silo.part1.rar"]);
    expect(libraryOf(pack.pkg, pack.files).library).toBeNull();
    const plain = pkg("Silo.Complete.German", ["silo.part1.rar"]);
    expect(libraryOf(plain.pkg, plain.files).library).toBeNull();
  });
});

describe("libraryOf, a copy over several episodes", () => {
  it("lists it for a part that's one of its later episodes", () => {
    copy("episode", 7, { season: 1, episode: 2, episodeEnd: 4, resolution: "1080p", group: "FuN" });
    const { pkg: p, files } = pkg("Silo.S01", ["Silo.S01E03.mkv"]);
    expect(libraryOf(p, files).library).toEqual({ have: ["1080p · FuN"], parts: 1, partsOwned: 1, season: null });
  });
});
