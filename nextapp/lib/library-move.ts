import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Writable } from "stream";
import { pipeline } from "stream/promises";
import { LIBRARY_DIR } from "./env";
import { formatBytes, plural } from "./format";
import { notify } from "./events";
import { packageOutputs, packagePath, safeName } from "./downloader";
import { isLibraryFile, isVideo, libraryFolderName, releaseFileNames, seasonFolder, seasonOf } from "./library-names";
import { EPISODE, videosIn } from "./library-scan";
import { getPackage, libraryCopies, setPackageMoved, type DownloadPackage } from "./store";
import { log, took } from "./log";

// Moving a finished download into the library, only ever by hand: its
// videos and subtitles are copied into the title's folder on the disk
// picked ("Name (Year) [tmdbid-N]", lib/library-names.ts; a show's
// into Season NN; a movie's named with spaces under the release's name,
// releaseFileNames). All are written as "<name>.part", hashed on the way
// and flushed to the disk (fsync); then all read back and hashed again; and
// only if every hash and size matches renamed. Once all are in, the package
// is marked moved, and only then its folder deleted. One move at a time,
// the rest wait. A title the disk
// has already (its "[tmdbid-N]" folder, whatever it's called) gets the
// files in that folder. A title the library has already (a movie's video,
// or one of the episodes a show's package brings, on any disk: ownedFiles)
// isn't moved as it is: Replace takes what the library had out once the
// new files are in: one version of everything. State lives on
// globalThis (see test/state.ts); a restart drops a move half done (its
// package keeps its files, the copied part stays to be overwritten).

// A disk's movies/ or shows/ folder: its path (the id to move to), the
// disk's name, free bytes (null if unreadable) and the title's folder
// there if it has one.
export type LibraryTarget = { path: string; disk: string; freeBytes: number | null; existing: string | null };
// What goes where: each file's path in the package and in the title's
// folder; error says why it can't be moved.
type MovePlan = {
  folder: string;
  files: { from: string; to: string; size: number }[];
  bytes: number;
  error: string | null;
};
// A move in the queue or running:
// what it's doing, bytes copied and read back (verified) of total each, its
// speed (bytes a second, over the last second or so); error if it failed
// (it stays listed until the next try).
// replace: what the library has of it goes once the new files are in;
// undefined: the library had none of it when it was queued (checked again
// when it starts).
type Move = {
  target: string;
  replace: boolean | undefined;
  copied: number;
  verified: number;
  total: number;
  phase: "copying" | "verifying";
  speed: number;
  running: boolean;
  error: string | null;
};
// scanDue: something came in or went out since the last rescan.
type MoveState = { moves: Map<number, Move>; chain: Promise<void>; scanDue?: boolean };

const g = globalThis as unknown as { __jellylensMoves?: MoveState };
function state(): MoveState {
  const s = (g.__jellylensMoves ??= {} as MoveState);
  s.moves ??= new Map();
  s.chain ??= Promise.resolve();
  return s;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const kindOf = (pkg: DownloadPackage) => (pkg.media?.type === "tv" ? "shows" : "movies");

// The library disks' folders for a package's kind (movies or shows),
// in disk order.
export function libraryTargets(pkg: DownloadPackage): LibraryTarget[] {
  if (!LIBRARY_DIR || !pkg.media) return [];
  const kind = kindOf(pkg);
  const tag = ` [tmdbid-${pkg.media.tmdbId}]`;
  let disks: string[];
  try {
    disks = fs
      .readdirSync(LIBRARY_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(LIBRARY_DIR, d.name, kind)))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
  return disks.map((disk) => {
    const dir = path.join(LIBRARY_DIR, disk, kind);
    let freeBytes: number | null = null;
    let existing: string | null = null;
    try {
      const s = fs.statfsSync(dir);
      freeBytes = s.bavail * s.bsize;
      existing = fs.readdirSync(dir).find((name) => name.endsWith(tag)) ?? null;
    } catch {
      // an unreachable disk: shown without numbers
    }
    return { path: dir, disk, freeBytes, existing };
  });
}

export function movePlan(pkg: DownloadPackage): MovePlan {
  const folder = pkg.media ? libraryFolderName(pkg.media) : "";
  const plan = (error: string | null, files: MovePlan["files"] = []): MovePlan => ({
    folder,
    files,
    bytes: files.reduce((n, f) => n + f.size, 0),
    error,
  });
  if (!LIBRARY_DIR) return plan("Set LIBRARY_DIR to move downloads into the library.");
  if (pkg.status !== "done") return plan("Only a finished package can be moved.");
  if (pkg.movedTo) return plan("It's in the library already.");
  if (!pkg.media) return plan("It isn't matched to a movie or show on TMDB.");
  const outputs = packageOutputs(pkg).filter((o) => isLibraryFile(o.path));
  const names = outputs.map((o) => o.path.split("/").pop()!);
  const files: MovePlan["files"] = [];
  if (pkg.media.type === "movie") {
    // The release name: the folder the archive put the video in (a DLC
    // taken by hand may be named anyhow), else the package's ("Name -
    // uploader" without the uploader; a DLC's or WCX's, so made safe).
    const video = outputs.find((o) => isVideo(o.path))?.path.split("/") ?? [];
    const folder = video.length > 1 ? video[video.length - 2] : "";
    const release = folder && !/\s/.test(folder) ? folder : safeName(pkg.name.replace(/\s+-\s+[^.]+$/, "").trim());
    const renamed = releaseFileNames(names, release);
    outputs.forEach((o, i) => files.push({ from: o.path, to: renamed[i], size: o.size }));
  } else {
    // Started with Skip (a pack in one archive came whole): not the
    // episodes the library has, by what the last scan found and still on
    // the disk (the download, these episodes too, is deleted afterwards).
    const has = new Set<string>();
    let skipped = 0;
    if (pkg.choice === "skip")
      for (const c of libraryCopies("episode", pkg.media.tmdbId).filter((c) =>
        fs.existsSync(path.join(LIBRARY_DIR, c.path)),
      ))
        for (let e = c.episode ?? 0; c.episode !== null && e <= (c.episodeEnd ?? c.episode); e++)
          has.add(`${c.season}:${e}`);
    for (const [i, o] of outputs.entries()) {
      const season = seasonOf(o.path, pkg.name);
      if (season === null) return plan(`No season in ${names[i]}.`);
      const eps = episodesOf(names[i]);
      if (eps.length && eps.every((e) => has.has(e))) {
        skipped++;
        continue;
      }
      files.push({ from: o.path, to: `${seasonFolder(season)}/${names[i]}`, size: o.size });
    }
    if (!files.length && skipped) return plan("The library has all of it.");
  }
  return plan(files.length ? null : "No video in it.", files);
}

// A video the library has of a package already, on any disk: a movie's,
// or a show's that is one of the episodes the package brings (SxxEyy);
// its path under LIBRARY_DIR, size, and the files named like it
// (subtitles: "<video's name without ending>.….srt"), which go with it.
export type OwnedFile = { path: string; size: number; extras: string[] };

// The episodes a file's name has ("S01E02-E03": "1:2", "1:3").
function episodesOf(name: string): string[] {
  const m = EPISODE.exec(name);
  if (!m) return [];
  const [season, first] = [Number(m[1]), Number(m[2])];
  const last = m[3] ? Math.max(first, Number(m[3])) : first;
  return Array.from({ length: last - first + 1 }, (_, i) => `${season}:${first + i}`);
}

// The files next to a video named like it, not videos themselves.
function extrasOf(rel: string): string[] {
  const dir = path.dirname(rel);
  const stem = path.basename(rel).replace(/\.[^.]+$/, "") + ".";
  try {
    return fs
      .readdirSync(path.join(LIBRARY_DIR, dir))
      .filter((n) => n.startsWith(stem) && !isVideo(n) && isLibraryFile(n))
      .map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

export async function ownedFiles(pkg: DownloadPackage, plan: MovePlan): Promise<OwnedFile[]> {
  if (!pkg.media || plan.error) return [];
  const show = pkg.media.type === "tv";
  const episodes = new Set(plan.files.flatMap((f) => episodesOf(path.basename(f.to))));
  const owned: OwnedFile[] = [];
  for (const t of libraryTargets(pkg)) {
    if (!t.existing) continue;
    for (const v of await videosIn(path.join(t.path, t.existing), t.disk))
      if (!show || episodesOf(v.name).some((e) => episodes.has(e)))
        owned.push({ path: v.rel, size: v.size, extras: extrasOf(v.rel) });
  }
  return owned.sort((a, b) => a.path.localeCompare(b.path));
}

// A package's move while it waits, runs or after it failed: the folder
// it goes to (one of libraryTargets' paths); done of total bytes in the
// phase it's in (copying, then verifying), so its bar fills once each.
export type MoveProgress = {
  target: string;
  done: number;
  total: number;
  phase: "copying" | "verifying";
  speed: number;
  running: boolean;
  error: string | null;
};
export function moveOf(pkgId: number): MoveProgress | null {
  const m = state().moves.get(pkgId);
  if (!m) return null;
  return {
    target: m.target,
    done: m.phase === "copying" ? m.copied : m.verified,
    total: m.total,
    phase: m.phase,
    speed: m.speed,
    running: m.running,
    error: m.error,
  };
}

// The disk a library folder is on ("/library/nvme01/movies" → "nvme01").
const diskOf = (folder: string) => path.relative(LIBRARY_DIR, folder).split(path.sep)[0];

// Queues a move to target (one of libraryTargets' paths); an error text
// if it can't. One the library has already needs replace (Replace: one
// version of everything); a Retry keeps what was said.
export async function startMove(pkg: DownloadPackage, target: string, replace?: boolean): Promise<string | null> {
  const s = state();
  const current = s.moves.get(pkg.id);
  if (current && !current.error) return "It's being moved already.";
  const plan = movePlan(pkg);
  if (plan.error) return plan.error;
  replace ??= current?.replace;
  if (replace === undefined && (await ownedFiles(pkg, plan)).length) return "The library has it already: Replace it.";
  const to = libraryTargets(pkg).find((t) => t.path === target);
  if (!to) return "No such library folder.";
  // Asked twice (a double click) while the library was being looked at.
  const now = s.moves.get(pkg.id);
  if (now && now !== current && !now.error) return "It's being moved already.";
  // What's queued for the same disk takes its room first.
  const queued = [...s.moves.values()]
    .filter((m) => !m.error && diskOf(m.target) === to.disk)
    .reduce((n, m) => n + m.total - m.copied, 0);
  if (to.freeBytes !== null && to.freeBytes - queued < plan.bytes) return `Not enough space on ${to.disk}.`;
  s.moves.set(pkg.id, {
    target,
    replace,
    copied: 0,
    verified: 0,
    total: plan.bytes,
    phase: "copying",
    speed: 0,
    running: false,
    error: null,
  });
  s.chain = s.chain.then(() => runMove(pkg.id));
  log.info(
    "organize",
    `${replace ? "Replace" : "Move"} queued: ${pkg.name}`,
    `· to ${path.relative(LIBRARY_DIR, target)} · ${formatBytes(plan.bytes)}`,
  );
  return null;
}

// Reads a stream through, counting its bytes into move (and its speed);
// the SHA-256 of what came by.
async function hashing(read: fs.ReadStream, move: Move, count: "copied" | "verified", into?: Writable) {
  const hash = crypto.createHash("sha256");
  let windowStart = Date.now();
  let windowBytes = 0;
  read.on("data", (chunk: Buffer | string) => {
    hash.update(chunk);
    move[count] += chunk.length;
    windowBytes += chunk.length;
    const now = Date.now();
    if (now - windowStart >= 1000) {
      move.speed = (windowBytes * 1000) / (now - windowStart);
      windowStart = now;
      windowBytes = 0;
    }
  });
  await pipeline(read, into ?? new Writable({ write: (_chunk, _encoding, done) => done() }));
  return hash.digest("hex");
}

// Flushes a file or folder to the disk; a folder only where the file
// system can (sshfs can't), a file always.
async function flush(file: string, folder = false) {
  try {
    const fh = await fs.promises.open(file, folder ? "r" : "r+");
    try {
      await fh.sync();
    } finally {
      await fh.close();
    }
  } catch (e) {
    if (!folder) throw e;
  }
}

// Copies files (src to dest) checked: all as "<dest>.part", hashed on the
// way, flushed to the disk, their sizes checked; then all read back and
// hashed again; renamed only if all match (the parts deleted if not).
async function copyChecked(files: { src: string; dest: string; size: number }[], move: Move) {
  const parts: { part: string; dest: string; hash: string }[] = [];
  try {
    move.phase = "copying";
    for (const { src, dest, size } of files) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const part = `${dest}.part`;
      parts.push({ part, dest, hash: "" });
      const read = fs.createReadStream(src, { highWaterMark: 4 << 20 });
      // Flushed every 128 MB on the way: else the kernel holds gigabytes in
      // memory, the bar is full long before they're on the disk and the
      // last flush takes as long as the copy.
      const fh = await fs.promises.open(part, "w");
      try {
        let unsynced = 0;
        const into = new Writable({
          write: (chunk: Buffer, _encoding, done) =>
            (async () => {
              for (let at = 0; at < chunk.length;) at += (await fh.write(chunk, at)).bytesWritten;
              unsynced += chunk.length;
              if (unsynced >= 128 << 20) {
                await fh.datasync();
                unsynced = 0;
              }
            })().then(() => done(), done),
        });
        parts.at(-1)!.hash = await hashing(read, move, "copied", into);
        await fh.sync();
      } finally {
        await fh.close();
      }
      const copied = fs.statSync(part).size;
      if (copied !== size)
        throw new Error(`${path.basename(dest)}: only ${formatBytes(copied)} of ${formatBytes(size)} were copied`);
    }
    move.phase = "verifying";
    move.speed = 0;
    for (const { part, dest, hash } of parts) {
      const read = fs.createReadStream(part, { highWaterMark: 4 << 20 });
      if ((await hashing(read, move, "verified")) !== hash)
        throw new Error(`${path.basename(dest)}: the copy doesn't match the original`);
    }
  } catch (e) {
    for (const { part } of parts) fs.rmSync(part, { force: true });
    throw e;
  }
  for (const { part, dest } of parts) fs.renameSync(part, dest);
  for (const dir of new Set(parts.map((p) => path.dirname(p.dest)))) await flush(dir, true);
}

async function runMove(pkgId: number) {
  const s = state();
  const move = s.moves.get(pkgId);
  const pkg = getPackage(pkgId);
  if (!move || !pkg) return void s.moves.delete(pkgId);
  move.running = true;
  const started = Date.now();
  try {
    const plan = movePlan(pkg);
    if (plan.error) throw new Error(plan.error);
    const to = libraryTargets(pkg).find((t) => t.path === move.target);
    if (!to) throw new Error("The library folder is gone.");
    const titleDir = path.join(to.path, to.existing ?? plan.folder);
    const root = packagePath(pkg);
    // Queued as nothing the library had, and since then another package of
    // the same title went in: back to New, where Replace can be picked,
    // rather than become a second version.
    if (move.replace === undefined && (await ownedFiles(pkg, plan)).length) {
      s.moves.delete(pkgId);
      log.warn("organize", `Not moved, the library has it by now: ${pkg.name}`);
      notify("Not moved", { description: `${titleOf(pkg)}: the library has it already`, tone: "warning" });
      return;
    }
    // What it replaces, from before the new files are there.
    const replaced = move.replace ? await ownedFiles(pkg, plan) : [];
    const dests = plan.files.map((f) => path.join(titleDir, f.to));
    await copyChecked(
      plan.files.map((f, i) => ({ src: path.join(root, f.from), dest: dests[i], size: f.size })),
      move,
    );
    // The old ones out only once the new are in (one of the same name is
    // overwritten already), and the folders they leave empty.
    for (const rel of replaced.flatMap((o) => [o.path, ...o.extras])) {
      const file = path.join(LIBRARY_DIR, rel);
      if (dests.includes(file)) continue;
      remove(file, () => fs.rmSync(file, { force: true }));
      // Up to the title's folder ("nvme01/movies/<title>"), not further.
      let dir = path.dirname(file);
      while (path.relative(LIBRARY_DIR, dir).split(path.sep).length > 2 && remove(dir, () => fs.rmdirSync(dir), true))
        dir = path.dirname(dir);
    }
    // Marked moved before its folder goes: if that fails, the files are in
    // the library and only a leftover folder remains.
    setPackageMoved(pkgId, {
      folder: path.relative(LIBRARY_DIR, titleDir),
      files: plan.files.map(({ from, to }) => ({ from, to })),
      replaced: move.replace ?? false,
    });
    s.moves.delete(pkgId);
    log.info(
      "organize",
      `${move.replace ? "Replaced" : "Moved"} in ${took(started)}: ${pkg.name}`,
      `· to ${path.relative(LIBRARY_DIR, titleDir)} · ${plural(plan.files.length, "file")}` +
        (replaced.length ? ` · took out ${replaced.map((o) => path.basename(o.path)).join(", ")}` : ""),
    );
    remove(root, () => fs.rmSync(root, { recursive: true, force: true }));
  } catch (e) {
    move.running = false;
    move.error = errorText(e);
    log.error("organize", `Move failed after ${took(started)}: ${pkg.name}`, e);
    notify("Move failed", { description: `${titleOf(pkg)}: ${move.error}`, tone: "error" });
  } finally {
    // Once the queue is through, the library is scanned again (and Jellyfin
    // asked to), so what came in counts as owned right away.
    if (!move.error) s.scanDue = true;
    if (s.scanDue && ![...s.moves.values()].some((m) => !m.error)) {
      s.scanDue = false;
      void import("./rescan").then((m) => m.rescan());
    }
  }
}

// A package's title for a note: TMDB's with its year, else its name.
const titleOf = (pkg: DownloadPackage) =>
  pkg.media ? `${pkg.media.title}${pkg.media.year ? ` (${pkg.media.year})` : ""}` : pkg.name;

// Deletes what a move left behind (or replaced); a failure only logged
// (quietly for a folder that isn't empty). Whether it went.
function remove(what: string, rm: () => void, quiet = false): boolean {
  try {
    rm();
    return true;
  } catch (e) {
    if (!quiet) log.error("organize", `Left ${what} behind`, e);
    return false;
  }
}
