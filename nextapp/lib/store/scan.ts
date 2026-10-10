import { db, fromJson, toJson, tx } from "../db";
import type { Probe } from "../ffprobe";
import type { TmdbDetails } from "../tmdb";
import { all, run } from "./sql";

// What the library scan keeps between runs (lib/library-scan.ts): each
// file's probe and each title's TMDB details.

export type StoredProbe = { size: number; mtime: number; probe: Probe };

export function getProbes(): Map<string, StoredProbe> {
  const rows = all<{ path: string; size: number; mtime: number; data: string }>("SELECT * FROM probes");
  return new Map(rows.map((r) => [r.path, { size: r.size, mtime: r.mtime, probe: fromJson<Probe>(r.data) }]));
}

// One at a time as they come in, so a scan cut short keeps what it read.
export function setProbe(path: string, p: StoredProbe) {
  run(
    `INSERT INTO probes (path, size, mtime, data) VALUES (?, ?, ?, ?)
     ON CONFLICT (path) DO UPDATE SET size = excluded.size, mtime = excluded.mtime, data = excluded.data`,
    path,
    p.size,
    p.mtime,
    toJson(p.probe),
  );
}

// Drops the probes of files no longer in the library.
export function pruneProbes(keep: Set<string>) {
  const gone = all<{ path: string }>("SELECT path FROM probes").filter((r) => !keep.has(r.path));
  if (!gone.length) return;
  tx(() => {
    const del = db().prepare("DELETE FROM probes WHERE path = ?");
    for (const r of gone) del.run(r.path);
  });
}

// "movie:949" / "tv:1396" → its details.
export function getDetails(): Map<string, TmdbDetails> {
  const rows = all<{ media_type: string; tmdb_id: string; data: string }>("SELECT * FROM tmdb_details");
  return new Map(rows.map((r) => [`${r.media_type}:${r.tmdb_id}`, fromJson<TmdbDetails>(r.data)]));
}

export function setDetails(entries: { mediaType: "movie" | "tv"; tmdbId: string; details: TmdbDetails }[]) {
  const at = new Date().toISOString();
  tx(() => {
    const put = db().prepare(
      `INSERT INTO tmdb_details (media_type, tmdb_id, data, checked_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (media_type, tmdb_id) DO UPDATE SET data = excluded.data, checked_at = excluded.checked_at`,
    );
    for (const e of entries) put.run(e.mediaType, e.tmdbId, toJson(e.details), at);
  });
}
