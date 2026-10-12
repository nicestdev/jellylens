import { all, run } from "./sql";

// A show's missing episodes the user dismissed on the Dashboard: a season,
// or the whole show (season null).
export type IgnoreEntry = { showId: string; season: number | null };

export function listIgnored(): IgnoreEntry[] {
  return all<IgnoreEntry>("SELECT show_id AS showId, season FROM ignored ORDER BY rowid");
}

export function addIgnored(e: IgnoreEntry) {
  run("INSERT OR IGNORE INTO ignored (show_id, season) VALUES (?, ?)", e.showId, e.season);
}

export function removeIgnored(e: IgnoreEntry) {
  run("DELETE FROM ignored WHERE show_id = ? AND season IS ?", e.showId, e.season);
}
