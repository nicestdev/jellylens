import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eventsAfter } from "./events";
import { DOWNLOAD_DIR, LIBRARY_DIR } from "./env";
import { libraryTargets, moveOf, movePlan, ownedFiles, startMove } from "./library-move";
import { db } from "./db";
import { addPackage, getPackage, setPackageMedia, setPackageStatus } from "./store";

// Downloads and the library (one disk, nvme01, with movies/) in throwaway
// folders of this file's own.
vi.mock("./env", async (importOriginal) => {
  const os = await import("node:os");
  const fsp = await import("node:fs");
  const p = await import("node:path");
  return {
    ...(await importOriginal<typeof import("./env")>()),
    DOWNLOAD_DIR: fsp.mkdtempSync(p.join(os.tmpdir(), "jellylens-downloads-")),
    LIBRARY_DIR: fsp.mkdtempSync(p.join(os.tmpdir(), "jellylens-library-")),
  };
});

const rescan = vi.hoisted(() => ({ rescan: vi.fn() }));
vi.mock("./rescan", () => rescan);

const MOVIES = () => path.join(LIBRARY_DIR, "nvme01", "movies");
const RELEASE = "Maze.Runner.2014.German.DL.1080p.BluRay.x265-VECTOR";
const FOLDER = "Maze Runner (2014) [tmdbid-198663]";

afterEach(() => {
  for (const dir of [DOWNLOAD_DIR, LIBRARY_DIR])
    for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true });
});
afterAll(() => {
  fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
  fs.rmSync(LIBRARY_DIR, { recursive: true, force: true });
});

// A finished movie package as VECTOR packs it: the release's folder with
// a video named with spaces, its subtitles, an .nfo.
function vectorPackage(): number {
  const id = addPackage({ name: RELEASE, dir: RELEASE, files: [] });
  setPackageMedia(id, { type: "movie", tmdbId: 198663, title: "Maze Runner", year: 2014, posterPath: null });
  setPackageStatus(id, "done");
  const files = {
    [`${RELEASE}/Maze Runner (2014).mkv`]: "video".repeat(1000),
    [`${RELEASE}/Maze Runner (2014).de.srt`]: "subtitles",
    [`${RELEASE}/Maze Runner (2014).nfo`]: "info",
  };
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(DOWNLOAD_DIR, RELEASE, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  fs.mkdirSync(MOVIES(), { recursive: true });
  return id;
}

// Waits for the queued moves to finish.
const settled = () => (globalThis as unknown as { __jellylensMoves: { chain: Promise<void> } }).__jellylensMoves.chain;

describe("moving into the library", () => {
  it("names a VECTOR video by its release, from the folder the archive made", () => {
    const id = vectorPackage();
    expect(movePlan(getPackage(id)!).files.map((f) => f.to)).toEqual([`${RELEASE}.de.srt`, `${RELEASE}.mkv`]);
  });

  it("copies the files in, checked, then deletes the package's folder", async () => {
    const id = vectorPackage();
    expect(await startMove(getPackage(id)!, MOVIES())).toBeNull();
    await settled();

    expect(moveOf(id)).toBeNull();
    const title = path.join(MOVIES(), FOLDER);
    expect(fs.readdirSync(title).sort()).toEqual([`${RELEASE}.de.srt`, `${RELEASE}.mkv`]);
    expect(fs.readFileSync(path.join(title, `${RELEASE}.mkv`), "utf8")).toBe("video".repeat(1000));
    expect(fs.existsSync(path.join(DOWNLOAD_DIR, RELEASE))).toBe(false);
    expect(getPackage(id)).toMatchObject({
      movedTo: path.join("nvme01", "movies", FOLDER),
      movedFiles: [
        { from: `${RELEASE}/Maze Runner (2014).de.srt`, to: `${RELEASE}.de.srt` },
        { from: `${RELEASE}/Maze Runner (2014).mkv`, to: `${RELEASE}.mkv` },
      ],
    });
  });

  it("queues a package once when asked twice at once (a double click)", async () => {
    const pkg = getPackage(vectorPackage())!;
    const answers = await Promise.all([startMove(pkg, MOVIES()), startMove(pkg, MOVIES())]);
    expect(answers.sort()).toEqual(["It's being moved already.", null].sort());
    await settled();
    expect(getPackage(pkg.id)?.movedTo).toBe(path.join("nvme01", "movies", FOLDER));
  });

  it("doesn't move one in as a second version the library got meanwhile: back to New, with a note", async () => {
    const id = vectorPackage();
    // The queue busy with another move until the library has the title.
    let release!: () => void;
    (globalThis as unknown as { __jellylensMoves: { chain: Promise<void> } }).__jellylensMoves = {
      chain: new Promise((resolve) => (release = resolve)),
    };
    expect(await startMove(getPackage(id)!, MOVIES())).toBeNull();
    fs.mkdirSync(path.join(MOVIES(), FOLDER));
    fs.writeFileSync(path.join(MOVIES(), FOLDER, "Maze.Runner.2014.German.DL.2160p.x265-ZQ.mkv"), "other");
    release();
    await settled();

    expect(moveOf(id)).toBeNull();
    expect(getPackage(id)?.movedTo).toBeNull();
    expect(fs.existsSync(path.join(DOWNLOAD_DIR, RELEASE))).toBe(true);
    expect(eventsAfter(0).events.at(-1)).toMatchObject({
      title: "Not moved",
      description: "Maze Runner (2014): the library has it already",
      tone: "warning",
    });
  });

  it("leaves no note for a move done, and scans the library again after it", async () => {
    const id = vectorPackage();
    await startMove(getPackage(id)!, MOVIES());
    await settled();
    expect(eventsAfter(0).events).toEqual([]);
    await vi.waitFor(() => expect(rescan.rescan).toHaveBeenCalledOnce());
  });

  it("puts a show's episodes into their season's folder", () => {
    const id = addPackage({ name: "Gen.V.S01.German.1080p-w00t", dir: "GenV", files: [] });
    setPackageMedia(id, { type: "tv", tmdbId: 205715, title: "Gen V", year: 2023, posterPath: null });
    setPackageStatus(id, "done");
    for (const name of ["Gen.V.S01E01.mkv", "Gen.V.S01E02.mkv"]) {
      fs.mkdirSync(path.join(DOWNLOAD_DIR, "GenV"), { recursive: true });
      fs.writeFileSync(path.join(DOWNLOAD_DIR, "GenV", name), "x");
    }
    const plan = movePlan(getPackage(id)!);
    expect(plan.folder).toBe("Gen V (2023) [tmdbid-205715]");
    expect(plan.files.map((f) => f.to)).toEqual(["Season 01/Gen.V.S01E01.mkv", "Season 01/Gen.V.S01E02.mkv"]);
  });

  it("leaves out the episodes the library has when started with Skip, if they're still on the disk", () => {
    const id = addPackage({ name: "Gen.V.S01.German.1080p-w00t", dir: "GenV", files: [] });
    setPackageMedia(id, { type: "tv", tmdbId: 205715, title: "Gen V", year: 2023, posterPath: null });
    setPackageStatus(id, "done");
    for (const name of ["Gen.V.S01E01.mkv", "Gen.V.S01E01.de.srt", "Gen.V.S01E02.mkv"]) {
      fs.mkdirSync(path.join(DOWNLOAD_DIR, "GenV"), { recursive: true });
      fs.writeFileSync(path.join(DOWNLOAD_DIR, "GenV", name), "x");
    }
    // The last scan found episode 1.
    db()
      .prepare(
        `INSERT INTO media_files (kind, item_id, idx, parent_id, title, tmdb_id, season, episode, file_name, path, size,
           resolution, codec, languages, search)
         VALUES ('episode', 'e1', 0, 's', 'Gen V', '205715', 1, 1, 'f.mkv', 'nvme01/shows/f.mkv', 1, '', '', '[]', 'g')`,
      )
      .run();
    const all = movePlan(getPackage(id)!).files.map((f) => f.to);
    expect(all).toHaveLength(3);
    fs.mkdirSync(path.join(LIBRARY_DIR, "nvme01", "shows"), { recursive: true });
    fs.writeFileSync(path.join(LIBRARY_DIR, "nvme01", "shows", "f.mkv"), "x");
    expect(movePlan({ ...getPackage(id)!, choice: "skip" }).files.map((f) => f.to)).toEqual([
      "Season 01/Gen.V.S01E02.mkv",
    ]);
    // Gone from the disk since that scan: it comes after all.
    fs.rmSync(path.join(LIBRARY_DIR, "nvme01", "shows", "f.mkv"));
    expect(movePlan({ ...getPackage(id)!, choice: "skip" }).files).toHaveLength(3);
  });

  it("counts what's queued for a disk before taking another move to it", async () => {
    const a = vectorPackage();
    const b = addPackage({ name: "Other.2020-X", dir: "Other", files: [] });
    setPackageMedia(b, { type: "movie", tmdbId: 7, title: "Other", year: 2020, posterPath: null });
    setPackageStatus(b, "done");
    fs.mkdirSync(path.join(DOWNLOAD_DIR, "Other"), { recursive: true });
    fs.writeFileSync(path.join(DOWNLOAD_DIR, "Other", "Other.mkv"), "y".repeat(5000));
    // Room for one of them, not both.
    const statfs = vi.spyOn(fs, "statfsSync").mockReturnValue({ bavail: 7000, bsize: 1 } as fs.StatsFs);
    try {
      expect(libraryTargets(getPackage(a)!)[0].freeBytes).toBe(7000);
      expect(await startMove(getPackage(a)!, MOVIES())).toBeNull();
      expect(await startMove(getPackage(b)!, MOVIES())).toBe("Not enough space on nvme01.");
    } finally {
      statfs.mockRestore();
    }
    return settled();
  });

  it("fails a move whose library folder is gone, keeping the package's files", async () => {
    const id = vectorPackage();
    // The queue held up until the folder is gone.
    let release!: () => void;
    const moves = ((globalThis as unknown as { __jellylensMoves?: { chain?: Promise<void> } }).__jellylensMoves ??= {});
    moves.chain = new Promise<void>((resolve) => (release = resolve));
    expect(await startMove(getPackage(id)!, MOVIES())).toBeNull();
    fs.rmSync(MOVIES(), { recursive: true });
    release();
    await settled();
    expect(moveOf(id)).toMatchObject({ running: false, error: "The library folder is gone." });
    expect(fs.existsSync(path.join(DOWNLOAD_DIR, RELEASE))).toBe(true);
    expect(eventsAfter(0).events.at(-1)).toMatchObject({ title: "Move failed", tone: "error" });
  });

  // What the library has of it already: another release's video and its
  // subtitles in the title's folder.
  const OLD = "Maze.Runner.2014.German.1080p.BluRay.x264-OLD";
  function owned() {
    const title = path.join(MOVIES(), FOLDER);
    fs.mkdirSync(title, { recursive: true });
    fs.writeFileSync(path.join(title, `${OLD}.mkv`), "old");
    fs.writeFileSync(path.join(title, `${OLD}.de.srt`), "old subtitles");
    return title;
  }

  it("lists what the library has already, and won't move it without Replace", async () => {
    const id = vectorPackage();
    owned();
    const pkg = getPackage(id)!;
    expect(await ownedFiles(pkg, movePlan(pkg))).toEqual([
      {
        path: path.join("nvme01", "movies", FOLDER, `${OLD}.mkv`),
        size: 3,
        extras: [path.join("nvme01", "movies", FOLDER, `${OLD}.de.srt`)],
      },
    ]);
    expect(await startMove(pkg, MOVIES())).toBe("The library has it already: Replace it.");
    expect(moveOf(id)).toBeNull();
  });

  it("Add as version keeps what the library had", async () => {
    const id = vectorPackage();
    const title = owned();
    expect(await startMove(getPackage(id)!, MOVIES(), false)).toBeNull();
    await settled();
    expect(fs.readdirSync(title).sort()).toEqual([
      `${OLD}.de.srt`,
      `${OLD}.mkv`,
      `${RELEASE}.de.srt`,
      `${RELEASE}.mkv`,
    ]);
    expect(getPackage(id)).toMatchObject({ replaced: false });
  });

  it("Replace takes out what the library had once the new files are in", async () => {
    const id = vectorPackage();
    const title = owned();
    expect(await startMove(getPackage(id)!, MOVIES(), true)).toBeNull();
    await settled();
    expect(fs.readdirSync(title).sort()).toEqual([`${RELEASE}.de.srt`, `${RELEASE}.mkv`]);
    expect(getPackage(id)).toMatchObject({ replaced: true });
    expect(eventsAfter(0).events).toEqual([]);
  });

  it("Replace of a show takes out only the episodes it brings", async () => {
    const id = addPackage({ name: "Gen.V.S01.German.1080p-w00t", dir: "GenV", files: [] });
    setPackageMedia(id, { type: "tv", tmdbId: 205715, title: "Gen V", year: 2023, posterPath: null });
    setPackageStatus(id, "done");
    fs.mkdirSync(path.join(DOWNLOAD_DIR, "GenV"), { recursive: true });
    fs.writeFileSync(path.join(DOWNLOAD_DIR, "GenV", "Gen.V.S01E02.German.1080p-w00t.mkv"), "new");
    const season = path.join(LIBRARY_DIR, "nvme01", "shows", "Gen V (2023) [tmdbid-205715]", "Season 01");
    fs.mkdirSync(season, { recursive: true });
    for (const e of ["01", "02"]) fs.writeFileSync(path.join(season, `Gen.V.S01E${e}.German.720p-OLD.mkv`), "old");
    const shows = path.join(LIBRARY_DIR, "nvme01", "shows");
    expect(await startMove(getPackage(id)!, shows, true)).toBeNull();
    await settled();
    expect(fs.readdirSync(season).sort()).toEqual([
      "Gen.V.S01E01.German.720p-OLD.mkv",
      "Gen.V.S01E02.German.1080p-w00t.mkv",
    ]);
  });
});
