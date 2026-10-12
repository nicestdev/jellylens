import { db, toJson, tx } from "../db";
import { all, byKey, run } from "./sql";

// ended: every episode TMDB knows about for this season has already aired —
// as opposed to a season that's still currently airing, where "missing"
// episodes may simply not be out yet.
export type MissingSeason = {
  season: number;
  episodes: string;
  wholeSeason: boolean;
  ended: boolean;
  count: number;
  // Aired episodes TMDB lists for the season (owned = total - count).
  total: number;
  // Every episode TMDB knows for the season, in order, for the per-episode
  // dots on the Dashboard. upcoming = not aired yet.
  episodeStates: EpisodeState[];
};
export type EpisodeState = { n: number; state: "owned" | "missing" | "upcoming" };
export type MissingEntry = { count: number; seasons: MissingSeason[] };

export const getMissingShows = () => byKey<MissingEntry>(all("SELECT show_id AS key, data FROM missing_shows"));

export function replaceMissing(byShowId: Record<string, MissingEntry>) {
  tx(() => {
    run("DELETE FROM missing_shows");
    const insert = db().prepare("INSERT INTO missing_shows (show_id, data) VALUES (?, ?)");
    for (const [id, value] of Object.entries(byShowId)) insert.run(id, toJson(value));
  });
}
