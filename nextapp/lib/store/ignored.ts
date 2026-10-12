import { all, run } from "./sql";

// A show whose missing episodes the user dismissed on the Dashboard, the
// whole show: there's no ignoring a single season.
export type IgnoreEntry = { showId: string };

export function listIgnored(): IgnoreEntry[] {
  return all<IgnoreEntry>("SELECT show_id AS showId FROM ignored ORDER BY rowid");
}

export function addIgnored(e: IgnoreEntry) {
  run("INSERT OR IGNORE INTO ignored (show_id) VALUES (?)", e.showId);
}

export function removeIgnored(e: IgnoreEntry) {
  run("DELETE FROM ignored WHERE show_id = ?", e.showId);
}
