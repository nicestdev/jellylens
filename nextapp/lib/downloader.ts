import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { ARCHIVE_PASSWORDS, DOWNLOAD_DIR } from "./env";
import { resolveLink } from "./hosters";
import {
  getDownloadSettings,
  getPackage,
  pauseAllPackages,
  resumeAllPackages,
  listFiles,
  nextQueuedFile,
  packageDirs,
  requeueInterrupted,
  setPackageStatus,
  updateFile,
  type DownloadFile,
  type DownloadPackage,
} from "./store";

// The download queue: as many files at a time as there are slots, oldest
// package first. A file is written as "<name>.part" and renamed once
// complete; after a restart it resumes from there (HTTP Range). Each
// archive set is extracted with 7-Zip into the package's folder as soon as
// its parts are in (see settlePackage) and, if that worked, its parts are
// deleted. State lives on globalThis (see test/state.ts).
type Live = { abort: AbortController; packageId: number; speed: number };
type DownloaderState = {
  live: Map<number, Live>; // by file id
  extracting: Map<number, { percent: number; child: ReturnType<typeof spawn> | null }>; // by package id
  pendingSets: Set<string>; // "<package id>:<set key>", waiting for or in extraction
  extractChain: Promise<void>;
};

const g = globalThis as unknown as { __jellylensDownloader?: DownloaderState };
// Each field filled in on its own: in `next dev` the object outlives a
// code reload, and one made by older code may lack a newer field.
function state(): DownloaderState {
  const s = (g.__jellylensDownloader ??= {} as DownloaderState);
  s.live ??= new Map();
  s.extracting ??= new Map();
  s.pendingSets ??= new Set();
  s.extractChain ??= Promise.resolve();
  return s;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// A file or folder name that stays inside DOWNLOAD_DIR.
export function safeName(name: string): string {
  return (
    name
      .replace(/[/\\\0]/g, "_")
      .replace(/[\x00-\x1f]/g, "")
      .trim()
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 200) || "download"
  );
}

// A folder for a new package: its name, numbered if taken.
export function packageDir(name: string): string {
  const base = safeName(name);
  const taken = new Set(packageDirs());
  for (let i = 1; ; i++) {
    const dir = i === 1 ? base : `${base} (${i})`;
    if (!taken.has(dir) && !fs.existsSync(path.join(DOWNLOAD_DIR, dir))) return dir;
  }
}

export const packagePath = (pkg: Pick<DownloadPackage, "dir">) => path.join(DOWNLOAD_DIR, pkg.dir);

// What's in a package's folder (paths relative to it, "/"-separated), with
// sizes; [] if it's gone.
export function packageOutputs(pkg: Pick<DownloadPackage, "dir">): { path: string; size: number }[] {
  const root = packagePath(pkg);
  try {
    return fs
      .readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => {
        const full = path.join(e.parentPath, e.name);
        return { path: path.relative(root, full).split(path.sep).join("/"), size: fs.statSync(full).size };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  } catch {
    return [];
  }
}

// A file in a package's folder by its relative path; null if the path
// leads outside it or to nothing. Symlinks (an archive can hold them) are
// followed first, so one can't point out of the folder either.
export function packageFile(pkg: Pick<DownloadPackage, "dir">, rel: string): string | null {
  const root = packagePath(pkg);
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) return null;
  try {
    if (!fs.realpathSync(full).startsWith(fs.realpathSync(root) + path.sep)) return null;
    return fs.statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

// Bytes per second of each file being fetched, and how far each extraction is.
export function liveProgress() {
  const s = state();
  return {
    speed: new Map([...s.live].map(([id, l]) => [id, l.speed])),
    extracting: new Map([...s.extracting].map(([id, e]) => [id, e.percent])),
  };
}

// The file's name: the server's, else the one it came with (the
// container's, or the link's).
function fileNameOf(res: Response, fallback: string): string {
  const cd = res.headers.get("content-disposition") ?? "";
  const star = /filename\*\s*=\s*(?:[\w-]+'[^']*')?([^;]+)/i.exec(cd)?.[1];
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(cd)?.[1];
  try {
    return safeName((star && decodeURIComponent(star.trim().replace(/^"|"$/g, ""))) || plain?.trim() || fallback);
  } catch {
    return safeName(plain?.trim() || fallback);
  }
}

async function downloadFile(file: DownloadFile, pkg: DownloadPackage) {
  const s = state();
  const abort = new AbortController();
  const live: Live = { abort, packageId: pkg.id, speed: 0 };
  s.live.set(file.id, live);
  updateFile(file.id, { status: "downloading", error: null });
  if (getPackage(pkg.id)?.status === "queued") setPackageStatus(pkg.id, "downloading");
  const dir = packagePath(pkg);
  fs.mkdirSync(dir, { recursive: true });
  let received = 0;

  try {
    const link = await resolveLink(file.url);
    // Picks up a partial download of this very file.
    const partial = path.join(dir, `${file.name}.part`);
    const have = file.received > 0 && fs.existsSync(partial) ? fs.statSync(partial).size : 0;
    const res = await fetch(link.url, {
      headers: have ? { Range: `bytes=${have}-` } : {},
      signal: abort.signal,
    });
    if (!res.ok || !res.body) throw new Error(`The hoster answered HTTP ${res.status}`);
    const resumed = have > 0 && res.status === 206;
    const name = resumed ? file.name : fileNameOf(res, file.name);
    const length = Number(res.headers.get("content-length")) || 0;
    const size = length ? length + (resumed ? have : 0) : file.size;
    const target = path.join(dir, `${name}.part`);
    if (!resumed && partial !== target) fs.rmSync(partial, { force: true });
    updateFile(file.id, { name, size, received: resumed ? have : 0 });

    received = resumed ? have : 0;
    let lastSave = Date.now();
    let windowStart = Date.now();
    let windowBytes = 0;
    const body = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
    body.on("data", (chunk: Buffer) => {
      if (abort.signal.aborted) return;
      received += chunk.length;
      windowBytes += chunk.length;
      const now = Date.now();
      if (now - windowStart >= 1000) {
        live.speed = (windowBytes * 1000) / (now - windowStart);
        windowStart = now;
        windowBytes = 0;
      }
      if (now - lastSave >= 1000) {
        lastSave = now;
        updateFile(file.id, { received });
      }
    });
    await pipeline(body, fs.createWriteStream(target, { flags: resumed ? "a" : "w" }), { signal: abort.signal });
    if (size && received < size) throw new Error(`The download broke off at ${received} of ${size} bytes`);
    fs.renameSync(target, path.join(dir, name));
    updateFile(file.id, { status: "done", received, size: size ?? received });
  } catch (e) {
    if (abort.signal.aborted) {
      // Paused: back in line, resumed from the bytes on disk later. (Removed
      // or reset: the row is gone or reset already.)
      if (abort.signal.reason === "pause") updateFile(file.id, { status: "queued", received });
      return;
    }
    updateFile(file.id, { status: "failed", error: errorText(e) });
  } finally {
    s.live.delete(file.id);
  }
}

// Archive sets: the files 7-Zip reads as one archive (a multi-part RAR's
// parts, an old-style .rar with its .r00…, a split 7z or ZIP), keyed by
// their common name; first: the one to hand to 7-Zip (it finds the rest),
// null if it's missing. A lone archive is a set of one. Anything else (an
// .mkv, an .nfo) isn't in a set and stays as it came.
type ArchiveSet = { key: string; first: string | null; members: string[] };

function setOf(name: string): { key: string; first: boolean } | null {
  let m: RegExpExecArray | null;
  if ((m = /^(.*)\.part(\d+)\.rar$/i.exec(name))) return { key: `${m[1]}.part*.rar`, first: Number(m[2]) === 1 };
  if ((m = /^(.*)\.(rar|r\d{2,3})$/i.exec(name))) return { key: `${m[1]}.rar`, first: m[2].toLowerCase() === "rar" };
  if ((m = /^(.*\.7z)(?:\.(\d{3}))?$/i.exec(name))) return { key: m[1], first: !m[2] || Number(m[2]) === 1 };
  if ((m = /^(.*)\.(zip|z\d{2})$/i.exec(name))) return { key: `${m[1]}.zip`, first: m[2].toLowerCase() === "zip" };
  return null;
}

export function archiveSets(names: string[]): ArchiveSet[] {
  const sets = new Map<string, ArchiveSet>();
  for (const name of names) {
    const of = setOf(name);
    if (!of) continue;
    const set = sets.get(of.key) ?? { key: of.key, first: null, members: [] };
    set.members.push(name);
    if (of.first) set.first = name;
    sets.set(of.key, set);
  }
  return [...sets.values()];
}

function run7z(args: string[], pkgId: number): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("7zz", args, { stdio: ["ignore", "pipe", "pipe"] });
    const entry = state().extracting.get(pkgId);
    if (entry) entry.child = child;
    let output = "";
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      output = (output + text).slice(-4000);
      const pct = [...text.matchAll(/(\d+)%/g)].pop();
      if (pct && entry) entry.percent = Number(pct[1]);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (e) =>
      reject((e as NodeJS.ErrnoException).code === "ENOENT" ? new Error("7-Zip (7zz) isn't installed") : e),
    );
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

// Extracts an archive into dir, trying Settings' passwords and then
// ARCHIVE_PASSWORDS in turn (7-Zip asks on the terminal if it gets none,
// so without any, or for an unencrypted archive, it gets a dummy). The
// error, or null.
async function extract7z(archive: string, dir: string, pkgId: number): Promise<string | null> {
  const known = [...new Set([...getDownloadSettings().passwords, ...ARCHIVE_PASSWORDS])];
  const passwords = known.length ? known : ["-"];
  let error = "";
  for (const pw of passwords) {
    const { code, output } = await run7z(["x", "-y", "-bsp1", "-bso0", `-p${pw}`, `-o${dir}`, archive], pkgId);
    if (code === 0) return null;
    if (!/wrong password/i.test(output)) {
      return (
        output
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /error|cannot|unexpected|missing/i.test(l))
          .slice(-2)
          .join(" · ") || `7-Zip exited with code ${code}`
      );
    }
    error = "Wrong archive password";
  }
  return error;
}

// Whether a set's files are all downloaded and not extracted yet.
const setReady = (pkgId: number, set: ArchiveSet) => {
  const files = listFiles(pkgId).filter((f) => set.members.includes(f.name));
  return files.length === set.members.length && files.every((f) => f.status === "done");
};

// One set, once its parts are all in: extracted into the package's folder,
// then its parts deleted and marked extracted. A failure fails the package
// (Retry extracts again; the parts stay).
async function extractSet(pkgId: number, set: ArchiveSet) {
  const s = state();
  try {
    const pkg = getPackage(pkgId);
    if (!pkg || pkg.status === "failed" || pkg.status === "done" || !set.first || !setReady(pkgId, set)) return;
    const dir = packagePath(pkg);
    s.extracting.set(pkgId, { percent: 0, child: null });
    const error = await extract7z(path.join(dir, set.first), dir, pkgId);
    // Removed, reset or failed meanwhile: leave it.
    if (!getPackage(pkgId) || getPackage(pkgId)?.status === "failed" || !setReady(pkgId, set)) return;
    if (error) return setPackageStatus(pkgId, "failed", `${set.first}: ${error}`);
    for (const f of listFiles(pkgId).filter((f) => set.members.includes(f.name))) {
      fs.rmSync(path.join(dir, f.name), { force: true });
      updateFile(f.id, { status: "extracted" });
    }
  } catch (e) {
    if (getPackage(pkgId)) setPackageStatus(pkgId, "failed", errorText(e));
  } finally {
    s.extracting.delete(pkgId);
    s.pendingSets.delete(`${pkgId}:${set.key}`);
    settlePackage(pkgId);
  }
}

// After each file and each extraction: every archive set whose parts are
// all in goes to 7-Zip (one at a time, beside the downloads), so a
// season's episodes come out one by one while the rest still downloads,
// and a multi-part film once its last part is in. A failed file fails the
// package at once, with each failed file's name and error, one per line
// (no more of its files start; those coming in finish, and Retry fetches
// just the failed ones). When nothing's left to download or extract, the
// package is done.
export function settlePackage(pkgId: number) {
  const pkg = getPackage(pkgId);
  if (!pkg || pkg.status === "pending" || pkg.status === "done" || pkg.status === "failed") return;
  const s = state();
  const files = listFiles(pkgId);
  for (const set of archiveSets(files.map((f) => f.name))) {
    const key = `${pkgId}:${set.key}`;
    if (!set.first || s.pendingSets.has(key) || !setReady(pkgId, set)) continue;
    s.pendingSets.add(key);
    s.extractChain = s.extractChain.then(() => extractSet(pkgId, set));
  }
  const failed = files.filter((f) => f.status === "failed");
  if (failed.length)
    return setPackageStatus(pkgId, "failed", failed.map((f) => `${f.name}: ${f.error ?? "Failed"}`).join("\n"));
  if (files.some((f) => f.status === "queued" || f.status === "downloading")) return;
  if ([...s.pendingSets].some((k) => k.startsWith(`${pkgId}:`))) {
    if (pkg.status !== "extracting") setPackageStatus(pkgId, "extracting");
    return;
  }
  setPackageStatus(pkgId, "done");
}

// Fills the free slots from the queue (oldest package first, a package's
// parts in order, so with several slots its parts come in side by side).
// Each finished file settles its package and fills its slot again.
export function kickDownloads() {
  const s = state();
  const { slots } = getDownloadSettings();
  while (s.live.size < slots) {
    const file = nextQueuedFile();
    const pkg = file && getPackage(file.packageId);
    if (!file || !pkg) return;
    // Marks the file as downloading before its first await, so the next
    // round of this loop picks another.
    downloadFile(file, pkg)
      .catch((e) => console.error("[downloads]", e))
      .finally(() => {
        settlePackage(pkg.id);
        kickDownloads();
      });
  }
}

// Pause all / Resume all: the same as each package's own Pause and Resume,
// for every one it applies to. Pausing stops what comes in (its partial
// files stay, to resume from).
export function pauseAllDownloads(paused: boolean) {
  if (paused) {
    const ids = new Set(pauseAllPackages());
    for (const live of state().live.values()) if (ids.has(live.packageId)) live.abort.abort("pause");
  } else {
    resumeAllPackages();
    kickDownloads();
  }
}

// At boot: what a restart interrupted goes back in the queue (an
// interrupted extraction starts over), then the queue runs.
export function resumeDownloads() {
  requeueInterrupted();
  for (const id of new Set(listFiles().map((f) => f.packageId))) settlePackage(id);
  kickDownloads();
}

// Stops what runs for a package: its download (keeping the partial file for
// "pause") and, unless pausing, its extraction.
export function stopPackage(pkgId: number, reason: "pause" | "reset" | "remove") {
  const s = state();
  for (const live of s.live.values()) if (live.packageId === pkgId) live.abort.abort(reason);
  if (reason !== "pause") s.extracting.get(pkgId)?.child?.kill();
}
