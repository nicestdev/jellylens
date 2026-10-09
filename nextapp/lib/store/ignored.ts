import { all, run } from "./sql";

// A row the user dismissed on the Missing page; season null = the whole show.
// Scoped per kind, so ignoring a show's missing episodes doesn't also hide
// its possible mismatches (and vice versa). For kind "collection", seriesId
// is the TMDB collection id and movieId one of its parts (null = all of it).
export type IgnoreKind = "missing" | "mismatch";
export type IgnoreEntry =
  | { kind: IgnoreKind; seriesId: string; season: number | null }
  | { kind: "collection"; collectionId: string; movieId: number | null };

type IgnoredRow = { kind: IgnoreEntry["kind"]; target: string; item: number | null };

const ignoredRow = (e: IgnoreEntry): IgnoredRow =>
  e.kind === "collection"
    ? { kind: e.kind, target: e.collectionId, item: e.movieId }
    : { kind: e.kind, target: e.seriesId, item: e.season };

export function listIgnored(): IgnoreEntry[] {
  return all<IgnoredRow>("SELECT kind, target, item FROM ignored ORDER BY rowid").map((r) =>
    r.kind === "collection"
      ? { kind: "collection", collectionId: r.target, movieId: r.item }
      : { kind: r.kind, seriesId: r.target, season: r.item },
  );
}

export function addIgnored(e: IgnoreEntry) {
  const r = ignoredRow(e);
  run("INSERT OR IGNORE INTO ignored (kind, target, item) VALUES (?, ?, ?)", r.kind, r.target, r.item);
}

export function removeIgnored(e: IgnoreEntry) {
  const r = ignoredRow(e);
  run("DELETE FROM ignored WHERE kind = ? AND target = ? AND item IS ?", r.kind, r.target, r.item);
}
