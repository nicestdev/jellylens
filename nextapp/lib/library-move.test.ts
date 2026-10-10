import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eventsAfter } from "./events";
import { DOWNLOAD_DIR, LIBRARY_DIR } from "./env";
import { libraryTargets, moveOf, movePlan, ownedFiles, startMove, startUndo } from "./library-move";
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

  it("Undo copies them back, then takes them and the emptied folder out", async () => {
    const id = vectorPackage();
    await startMove(getPackage(id)!, MOVIES());
    await settled();

    expect(startUndo(getPackage(id)!)).toBeNull();
    await settled();

    expect(moveOf(id)).toBeNull();
    expect(getPackage(id)).toMatchObject({ movedTo: null, movedFiles: null });
    expect(fs.readFileSync(path.join(DOWNLOAD_DIR, RELEASE, RELEASE, "Maze Runner (2014).mkv"), "utf8")).toBe(
      "video".repeat(1000),
    );
    expect(fs.existsSync(path.join(MOVIES(), FOLDER))).toBe(false);
    expect(movePlan(getPackage(id)!).error).toBeNull();
  });

  it("Undo leaves a title's folder that has other files", async () => {
    const id = vectorPackage();
    const title = path.join(MOVIES(), FOLDER);
    fs.mkdirSync(title);
    fs.writeFileSync(path.join(title, "poster.jpg"), "jpg");
    await startMove(getPackage(id)!, MOVIES());
    await settled();
    startUndo(getPackage(id)!);
    await settled();

    expect(fs.readdirSync(title)).toEqual(["poster.jpg"]);
  });

  it("notes each move and Undo done", async () => {
    const id = vectorPackage();
    await startMove(getPackage(id)!, MOVIES());
    await settled();
    startUndo(getPackage(id)!);
    await settled();
    expect(eventsAfter(0).events.map((e) => [e.title, e.description, e.tone])).toEqual([
      ["Moved into the library", "Maze Runner (2014)", "success"],
      ["Back to Organize", "Maze Runner (2014)", "success"],
    ]);
    // The library scanned again after each.
    await vi.waitFor(() => expect(rescan.rescan).toHaveBeenCalledTimes(2));
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

  it("won't undo what isn't in the library anymore, or a move without its files known", async () => {
    const id = vectorPackage();
    await startMove(getPackage(id)!, MOVIES());
    await settled();
    fs.rmSync(path.join(MOVIES(), FOLDER, `${RELEASE}.de.srt`));
    expect(startUndo(getPackage(id)!)).toBe(`${RELEASE}.de.srt isn't in the library anymore.`);
    expect(startUndo({ ...getPackage(id)!, movedFiles: null })).toBe("Nothing to undo.");
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

  it("lists what the library has already, and won't move it without Replace or Add as version", async () => {
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
    expect(await startMove(pkg, MOVIES())).toBe("The library has it already: Replace, or Add as version.");
    expect(moveOf(id)).toBeNull();
  });

  it("Add as version keeps what the library had, and can be undone", async () => {
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
    expect(startUndo(getPackage(id)!)).toBeNull();
    await settled();
  });

  it("Replace takes out what the library had once the new files are in, with no Undo", async () => {
    const id = vectorPackage();
    const title = owned();
    expect(await startMove(getPackage(id)!, MOVIES(), true)).toBeNull();
    await settled();
    expect(fs.readdirSync(title).sort()).toEqual([`${RELEASE}.de.srt`, `${RELEASE}.mkv`]);
    expect(getPackage(id)).toMatchObject({ replaced: true });
    expect(startUndo(getPackage(id)!)).toBe("It replaced what the library had: no Undo.");
    expect(eventsAfter(0).events.at(-1)).toMatchObject({ title: "Replaced in the library", tone: "success" });
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
