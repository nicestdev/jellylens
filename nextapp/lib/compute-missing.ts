import {
  getEpisodes,
  getTmdbShows,
  replaceMissing,
  syncedAt,
  type LibraryEpisode,
  type MissingEntry,
  type TmdbShowEntry,
} from "./store";

// The missing recheck: no network, just the Jellyfin library diffed against
// what the TMDB sync stored. The diffs are pure functions; computeMissing
// reads their input from the database and writes their results back.

// Groups a sorted list of episode numbers into "3, 5-7, 9" style ranges.
export function formatEpisodeRanges(numbers: number[]): string {
  const parts: string[] = [];
  let start: number | null = null;
  let prev: number | null = null;
  for (const n of numbers) {
    if (start === null) {
      start = n;
    } else if (n !== prev! + 1) {
      parts.push(start === prev ? String(start) : `${start}-${prev}`);
      start = n;
    }
    prev = n;
  }
  if (start !== null) parts.push(start === prev ? String(start) : `${start}-${prev}`);
  return parts.join(", ");
}

// showId -> season -> owned episode numbers. A combined multi-episode
// file (S02E01-E02 in one) carries episodeEnd, so every number in that
// range counts as owned, not just the first.
export function ownedEpisodes(episodes: LibraryEpisode[]): Map<string, Map<number, Set<number>>> {
  const byShow = new Map<string, Map<number, Set<number>>>();
  for (const ep of episodes) {
    if (!ep.showId || ep.season == null || ep.episode == null) continue;
    const seasons = byShow.get(ep.showId) ?? new Map<number, Set<number>>();
    byShow.set(ep.showId, seasons);
    const owned = seasons.get(ep.season) ?? new Set<number>();
    seasons.set(ep.season, owned);
    for (let n = ep.episode; n <= (ep.episodeEnd ?? ep.episode); n++) owned.add(n);
  }
  return byShow;
}

// Per series: the aired episodes it doesn't own.
export function diffShow(
  tmdbShows: Record<string, TmdbShowEntry>,
  owned: Map<string, Map<number, Set<number>>>,
): Record<string, MissingEntry> {
  const missing: Record<string, MissingEntry> = {};

  for (const [showId, { seasons: tmdbSeasons }] of Object.entries(tmdbShows)) {
    const ownedSeasons = owned.get(showId) ?? new Map<number, Set<number>>();
    const seasons: MissingEntry["seasons"] = [];

    for (const season of tmdbSeasons) {
      const have = ownedSeasons.get(season.season) ?? new Set<number>();
      const missingNumbers = season.airedEpisodeNumbers.filter((n) => !have.has(n));
      if (missingNumbers.length) {
        const aired = new Set(season.airedEpisodeNumbers);
        const all = [...new Set([...season.episodeNumbers, ...season.airedEpisodeNumbers])].sort((a, b) => a - b);
        seasons.push({
          season: season.season,
          episodes: formatEpisodeRanges(missingNumbers),
          wholeSeason: have.size === 0,
          ended: season.episodeNumbers.length > 0 && season.airedEpisodeNumbers.length === season.episodeNumbers.length,
          count: missingNumbers.length,
          total: season.airedEpisodeNumbers.length,
          episodeStates: all.map((n) => ({ n, state: have.has(n) ? "owned" : aired.has(n) ? "missing" : "upcoming" })),
        });
      }
    }

    const count = seasons.reduce((sum, s) => sum + s.count, 0);
    if (count) missing[showId] = { count, seasons };
  }
  return missing;
}

export function computeMissing(now = new Date()) {
  if (!syncedAt("tmdb")) throw new Error("Sync TMDB first — nothing to compare against yet.");

  const missing = diffShow(getTmdbShows(), ownedEpisodes(getEpisodes()));
  const at = now.toISOString();
  replaceMissing(missing, at);

  return {
    incompleteCount: Object.keys(missing).length,
    syncedAt: at,
  };
}
