import { fromJson, toJson, tx } from "../db";
import { all, one, run } from "./sql";

// Packages on the Downloads page and their files (schema in lib/db.ts). The
// queue itself (what runs next) is lib/downloader.ts.
// pending: added and looked at, waiting for a start by hand. paused: the
// queue skips it until it's resumed.
export type DownloadStatus = "pending" | "paused" | "queued" | "downloading" | "extracting" | "done" | "failed";
export type DownloadFile = {
  id: number;
  packageId: number;
  url: string;
  name: string;
  size: number | null;
  received: number;
  // extracted: its archive set came out, and it's deleted. skipped: left
  // out at Start (already in the library).
  status: "queued" | "downloading" | "done" | "extracted" | "skipped" | "failed";
  error: string | null;
};
export type DownloadPackage = {
  id: number;
  name: string;
  dir: string;
  status: DownloadStatus;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  // The TMDB entry its name points to; null if none (or not looked up yet).
  media: DownloadMedia | null;
  matched: boolean;
  // Moved into the library: the folder its files went to, and which went
  // where (from: in the package, to: in that folder); null if not.
  // replaced: by Replace, what the library had of it taken out (no Undo).
  movedTo: string | null;
  movedAt: string | null;
  movedFiles: MovedFile[] | null;
  replaced: boolean;
};
export type MovedFile = { from: string; to: string };
export type DownloadMedia = {
  type: "movie" | "tv";
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
};

type PackageRow = {
  id: number;
  name: string;
  dir: string;
  status: DownloadStatus;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  media_type: "movie" | "tv" | null;
  tmdb_id: number | null;
  title: string | null;
  year: number | null;
  poster_path: string | null;
  matched_at: string | null;
  moved_to: string | null;
  moved_at: string | null;
  moved_files: string | null;
  moved_replaced: number;
};
type FileRow = Omit<DownloadFile, "packageId"> & { package_id: number };

const toPackage = (r: PackageRow): DownloadPackage => ({
  id: r.id,
  name: r.name,
  dir: r.dir,
  status: r.status,
  error: r.error,
  createdAt: r.created_at,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  media:
    r.media_type && r.tmdb_id && r.title
      ? { type: r.media_type, tmdbId: r.tmdb_id, title: r.title, year: r.year, posterPath: r.poster_path }
      : null,
  matched: r.matched_at !== null,
  movedTo: r.moved_to,
  movedAt: r.moved_at,
  movedFiles: r.moved_files ? (JSON.parse(r.moved_files) as MovedFile[]) : null,
  replaced: r.moved_replaced === 1,
});
const toFile = ({ package_id, ...r }: FileRow): DownloadFile => ({ ...r, packageId: package_id });

export function addPackage(pkg: {
  name: string;
  dir: string;
  // error: a file it can't fetch, in failed (no account for its hoster).
  files: { url: string; name: string; size: number | null; error?: string }[];
}): number {
  return tx(() => {
    const id = Number(
      run(
        "INSERT INTO download_packages (name, dir, status, created_at) VALUES (?, ?, 'pending', ?)",
        pkg.name,
        pkg.dir,
        new Date().toISOString(),
      ).lastInsertRowid,
    );
    for (const f of pkg.files) {
      run(
        "INSERT INTO download_files (package_id, url, name, size, status, error) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        f.url,
        f.name,
        f.size,
        f.error ? "failed" : "queued",
        f.error ?? null,
      );
    }
    return id;
  });
}

// Newest first.
export function listPackages(): DownloadPackage[] {
  return all<PackageRow>("SELECT * FROM download_packages ORDER BY id DESC").map(toPackage);
}

// Packages to look up on TMDB: never looked up, or found nothing before
// the matching last changed (rulesChanged, an ISO time), so it gets
// another go. Newest first.
export function packagesToMatch(rulesChanged: string): DownloadPackage[] {
  return all<PackageRow>(
    "SELECT * FROM download_packages WHERE matched_at IS NULL OR (tmdb_id IS NULL AND matched_at < ?) ORDER BY id DESC",
    rulesChanged,
  ).map(toPackage);
}

export function getPackage(id: number): DownloadPackage | null {
  const row = one<PackageRow>("SELECT * FROM download_packages WHERE id = ?", id);
  return row ? toPackage(row) : null;
}

export function packageDirs(): string[] {
  return all<{ dir: string }>("SELECT dir FROM download_packages").map((r) => r.dir);
}

export function listFiles(packageId?: number): DownloadFile[] {
  return (
    packageId === undefined
      ? all<FileRow>("SELECT * FROM download_files ORDER BY id")
      : all<FileRow>("SELECT * FROM download_files WHERE package_id = ? ORDER BY id", packageId)
  ).map(toFile);
}

// The next file to fetch: the first queued one of the package started
// first (Start order, kept through Pause, Resume, Retry and Reset).
export function nextQueuedFile(): DownloadFile | null {
  const row = one<FileRow>(
    `SELECT f.* FROM download_files f JOIN download_packages p ON p.id = f.package_id
     WHERE f.status = 'queued' AND p.status IN ('queued', 'downloading')
     ORDER BY coalesce(p.started_at, p.created_at), p.id, f.id LIMIT 1`,
  );
  return row ? toFile(row) : null;
}

export function updateFile(
  id: number,
  changes: Partial<Pick<DownloadFile, "name" | "size" | "received" | "status" | "error">>,
) {
  const cols = Object.keys(changes);
  if (!cols.length) return;
  run(
    `UPDATE download_files SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
    ...Object.values(changes),
    id,
  );
}

export function setPackageStatus(id: number, status: DownloadStatus, error: string | null = null) {
  const finished = status === "done" || status === "failed" ? new Date().toISOString() : null;
  run("UPDATE download_packages SET status = ?, error = ?, finished_at = ? WHERE id = ?", status, error, finished, id);
}

export function deletePackage(id: number) {
  run("DELETE FROM download_packages WHERE id = ?", id);
}

// What a package's name was matched to on TMDB (null: nothing).
export function setPackageMedia(id: number, media: DownloadMedia | null) {
  run(
    "UPDATE download_packages SET media_type = ?, tmdb_id = ?, title = ?, year = ?, poster_path = ?, matched_at = ? WHERE id = ?",
    media?.type ?? null,
    media?.tmdbId ?? null,
    media?.title ?? null,
    media?.year ?? null,
    media?.posterPath ?? null,
    new Date().toISOString(),
    id,
  );
}

// A finished package's files are in the library now, in folder (replaced:
// by Replace); or (null) back in its own folder.
export function setPackageMoved(id: number, moved: { folder: string; files: MovedFile[]; replaced?: boolean } | null) {
  run(
    "UPDATE download_packages SET moved_to = ?, moved_at = ?, moved_files = ?, moved_replaced = ? WHERE id = ?",
    moved?.folder ?? null,
    moved ? new Date().toISOString() : null,
    moved ? JSON.stringify(moved.files) : null,
    moved?.replaced ? 1 : 0,
    id,
  );
}

// A pending package into the queue, without the files in skip.
export function startPackage(id: number, skip: number[] = []) {
  tx(() => {
    for (const fileId of skip)
      run("UPDATE download_files SET status = 'skipped' WHERE id = ? AND package_id = ?", fileId, id);
    run(
      "UPDATE download_packages SET status = 'queued', started_at = ? WHERE id = ? AND status = 'pending'",
      new Date().toISOString(),
      id,
    );
  });
}

export function pausePackage(id: number) {
  run("UPDATE download_packages SET status = 'paused' WHERE id = ? AND status IN ('queued', 'downloading')", id);
}

export function resumePackage(id: number) {
  run("UPDATE download_packages SET status = 'queued' WHERE id = ? AND status = 'paused'", id);
}

// Back to a new package, every file from scratch (the caller deletes
// what's on disk), those skipped at Start too: it's looked over and
// started again.
export function resetPackage(id: number) {
  tx(() => {
    run("UPDATE download_files SET status = 'queued', received = 0, error = NULL WHERE package_id = ?", id);
    run(
      "UPDATE download_packages SET status = 'pending', error = NULL, started_at = NULL, finished_at = NULL WHERE id = ?",
      id,
    );
  });
}

// Puts a failed package back in the queue: its failed files from where they
// stopped, or, if they all came in, just the extraction again.
export function retryPackage(id: number) {
  tx(() => {
    run("UPDATE download_files SET status = 'queued', error = NULL WHERE package_id = ? AND status = 'failed'", id);
    run(
      "UPDATE download_packages SET status = 'queued', error = NULL, finished_at = NULL WHERE id = ? AND status = 'failed'",
      id,
    );
  });
}

// After a restart: what was running when the server stopped goes back in
// the queue (a download resumes from the bytes on disk).
export function requeueInterrupted() {
  tx(() => {
    run("UPDATE download_files SET status = 'queued' WHERE status = 'downloading'");
    run("UPDATE download_packages SET status = 'queued' WHERE status IN ('downloading', 'extracting')");
  });
}

// The queue's settings: slots (how many files come in at once), passwords
// (tried in turn on an encrypted archive, before ARCHIVE_PASSWORDS).
type DownloadSettings = { slots: number; passwords: string[] };
export const MAX_DOWNLOAD_SLOTS = 10;
const DEFAULT_SETTINGS: DownloadSettings = { slots: 2, passwords: [] };

export function getDownloadSettings(): DownloadSettings {
  const stored = all<{ key: string; value: string }>("SELECT key, value FROM download_settings");
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(stored.map((r) => [r.key, fromJson(r.value)])) };
}

export function setDownloadSettings(changes: Partial<DownloadSettings>) {
  tx(() => {
    for (const [key, value] of Object.entries(changes)) {
      run(
        "INSERT INTO download_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        key,
        toJson(value),
      );
    }
  });
}

// Every waiting or downloading package paused; their ids.
export function pauseAllPackages(): number[] {
  return all<{ id: number }>(
    "UPDATE download_packages SET status = 'paused' WHERE status IN ('queued', 'downloading') RETURNING id",
  ).map((r) => r.id);
}

export function resumeAllPackages() {
  run("UPDATE download_packages SET status = 'queued' WHERE status = 'paused'");
}
