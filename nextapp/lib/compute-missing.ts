import {
  getEpisodes,
  getTmdbCollections,
  getTmdbSeries,
  libraryEntries,
  replaceMissing,
  syncedAt,
  type CollectionPart,
  type JellyfinEpisode,
  type MismatchEntry,
  type MissingCollection,
  type MissingEntry,
  type TmdbCollection,
  type TmdbSeriesEntry,
} from "./store";
import { movieAvailability } from "./availability";
import { releaseWindow } from "./dates";

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

// seriesId -> season -> owned episode numbers. A combined multi-episode
// file (S02E01-E02 in one) carries IndexNumberEnd, so every number in that
// range counts as owned, not just the first.
export function ownedEpisodes(episodes: JellyfinEpisode[]): Map<string, Map<number, Set<number>>> {
  const bySeries = new Map<string, Map<number, Set<number>>>();
  for (const ep of episodes) {
    if (!ep.SeriesId || ep.ParentIndexNumber == null || ep.IndexNumber == null) continue;
    const seasons = bySeries.get(ep.SeriesId) ?? new Map<number, Set<number>>();
    bySeries.set(ep.SeriesId, seasons);
    const owned = seasons.get(ep.ParentIndexNumber) ?? new Set<number>();
    seasons.set(ep.ParentIndexNumber, owned);
    for (let n = ep.IndexNumber; n <= (ep.IndexNumberEnd ?? ep.IndexNumber); n++) owned.add(n);
  }
  return bySeries;
}

// Per series: aired episodes not owned (missing), and owned episodes or
// seasons TMDB doesn't know (mismatches — usually a wrong TMDB match).
// Season 0 (specials) never counts as a mismatch: Jellyfin routinely has
// specials TMDB's data is thin on.
export function diffSeries(
  tmdbSeries: Record<string, TmdbSeriesEntry>,
  owned: Map<string, Map<number, Set<number>>>,
): { missing: Record<string, MissingEntry>; mismatches: Record<string, MismatchEntry> } {
  const missing: Record<string, MissingEntry> = {};
  const mismatches: Record<string, MismatchEntry> = {};

  for (const [seriesId, { seasons: tmdbSeasons }] of Object.entries(tmdbSeries)) {
    const ownedSeasons = owned.get(seriesId) ?? new Map<number, Set<number>>();
    const seasons: MissingEntry["seasons"] = [];
    const extraEpisodes: MismatchEntry["extraEpisodes"] = [];

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

      const known = new Set(season.episodeNumbers);
      const extra = [...have].filter((n) => !known.has(n)).sort((a, b) => a - b);
      if (extra.length) {
        extraEpisodes.push({ season: season.season, episodes: formatEpisodeRanges(extra), count: extra.length });
      }
    }

    const knownSeasons = new Set(tmdbSeasons.map((s) => s.season));
    const extraSeasons = [...ownedSeasons.keys()].filter((s) => s !== 0 && !knownSeasons.has(s)).sort((a, b) => a - b);

    const count = seasons.reduce((sum, s) => sum + s.count, 0);
    if (count) missing[seriesId] = { count, seasons };
    if (extraSeasons.length || extraEpisodes.length) mismatches[seriesId] = { extraSeasons, extraEpisodes };
  }
  return { missing, mismatches };
}

// Out on disc or digital, by the same rules as Discover and the Wishlist
// (movieAvailability). Parts released over a year ago carry no release
// dates (the TMDB sync skips them) and count as out; a recent one whose
// dates couldn't be fetched doesn't, until the next TMDB sync gets them.
function homeReleased(p: CollectionPart, today: string, yearAgo: string): boolean {
  if (!p.releaseDate || p.releaseDate > today) return false;
  if (!p.releases) return p.releaseDate < yearAgo;
  const availability = movieAvailability(p.releases, p.releaseDate, today, yearAgo);
  return availability === null || availability.status === "digital";
}

// Per collection with a part not owned (by TMDB movie id) that's out on disc
// or digital: its owned parts and those. Parts in cinemas, announced or
// undated are left out until they're out. ownedMovies: their TMDB ids.
export function missingCollections(
  collections: Record<string, TmdbCollection>,
  ownedMovies: Set<number>,
  now = new Date(),
): Record<string, MissingCollection> {
  const { today, yearAgo } = releaseWindow(now);
  const result: Record<string, MissingCollection> = {};
  for (const [id, collection] of Object.entries(collections)) {
    const parts = collection.parts
      .filter((p) => ownedMovies.has(p.tmdbId) || homeReleased(p, today, yearAgo))
      // The release dates were only needed for the check above.
      .map((p) => ({
        tmdbId: p.tmdbId,
        title: p.title,
        releaseDate: p.releaseDate,
        posterPath: p.posterPath,
        owned: ownedMovies.has(p.tmdbId),
      }));
    const count = parts.filter((p) => !p.owned).length;
    if (count) result[id] = { count, parts };
  }
  return result;
}

export function computeMissing(now = new Date()) {
  if (!syncedAt("tmdb")) throw new Error("Sync TMDB first — nothing to compare against yet.");

  const { missing, mismatches } = diffSeries(getTmdbSeries(), ownedEpisodes(getEpisodes()));
  const ownedMovies = new Set(
    libraryEntries()
      .filter((e) => e.mediaType === "movie")
      .map((e) => Number(e.tmdbId)),
  );
  const collections = missingCollections(getTmdbCollections(), ownedMovies, now);
  const at = now.toISOString();
  replaceMissing(missing, collections, mismatches, at);

  return {
    incompleteCount: Object.keys(missing).length,
    mismatchCount: Object.keys(mismatches).length,
    incompleteCollectionCount: Object.keys(collections).length,
    syncedAt: at,
  };
}
