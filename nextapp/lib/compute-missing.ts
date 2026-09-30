import { save, type Store, type MissingEntry, type MismatchEntry, type MissingCollection, type CollectionPart } from "./store";
import { movieAvailability } from "./requests";

// Groups a sorted list of episode numbers into "3, 5-7, 9" style ranges.
function formatEpisodeRanges(numbers: number[]): string[] {
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
  if (start !== null) {
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
  }
  return parts;
}

// Out on disc or digital, going by the same rules as the Requests page
// (lib/requests.ts). Parts released over a year ago carry no release dates
// (see syncCollections) and count as out; a recent one whose dates couldn't
// be fetched doesn't, until the next TMDB sync gets them.
function homeReleased(p: CollectionPart, today: string, yearAgo: string): boolean {
  if (!p.releaseDate || p.releaseDate > today) return false;
  if (!p.releases) return p.releaseDate < yearAgo;
  const availability = movieAvailability(p.releases, p.releaseDate, today, yearAgo);
  return availability === null || availability.status === "digital";
}

// Parts of each synced TMDB collection that aren't owned (matched by TMDB
// movie id) and are out on disc or digital. The rest (in cinemas, announced,
// undated) is dropped entirely and shows up once it's out.
function computeMissingCollections(store: Store): Record<string, MissingCollection> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const owned = new Map(
    store.jellyfin.movies.filter((m) => m.ProviderIds?.Tmdb).map((m) => [Number(m.ProviderIds!.Tmdb), m])
  );
  const byCollectionId: Record<string, MissingCollection> = {};

  for (const [id, collection] of Object.entries(store.tmdb.byCollectionId)) {
    const parts = collection.parts
      .filter((p) => owned.has(p.tmdbId) || homeReleased(p, today, yearAgo))
      // The release dates were only needed for the check above.
      .map((p) => ({
        tmdbId: p.tmdbId,
        title: p.title,
        releaseDate: p.releaseDate,
        posterPath: p.posterPath,
        owned: owned.has(p.tmdbId),
        fileName: owned.get(p.tmdbId)?.FileName,
      }));
    const count = parts.filter((p) => !p.owned).length;
    if (count) byCollectionId[id] = { count, parts };
  }
  return byCollectionId;
}

// Pure, synchronous, no network: diffs store.jellyfin.episodes against
// store.tmdb.bySeriesId to find already-aired episodes we don't own.
export function computeMissing(store: Store) {
  if (!store.tmdb.syncedAt) {
    throw new Error("Sync TMDB first — nothing to compare against yet.");
  }

  // seriesId -> seasonNumber -> Set of owned episode numbers. A combined
  // multi-episode file (e.g. S02E01-E02 in one file) carries IndexNumberEnd,
  // so every number in that range counts as owned, not just the first.
  const ownedBySeries = new Map<string, Map<number, Set<number>>>();
  for (const ep of store.jellyfin.episodes) {
    if (!ep.SeriesId || ep.ParentIndexNumber == null || ep.IndexNumber == null) continue;
    let seasons = ownedBySeries.get(ep.SeriesId);
    if (!seasons) {
      seasons = new Map();
      ownedBySeries.set(ep.SeriesId, seasons);
    }
    let owned = seasons.get(ep.ParentIndexNumber);
    if (!owned) {
      owned = new Set();
      seasons.set(ep.ParentIndexNumber, owned);
    }
    const endNumber = ep.IndexNumberEnd ?? ep.IndexNumber;
    for (let n = ep.IndexNumber; n <= endNumber; n++) owned.add(n);
  }

  const bySeriesId: Record<string, MissingEntry> = {};
  const mismatchesBySeriesId: Record<string, MismatchEntry> = {};

  for (const [seriesId, tmdbEntry] of Object.entries(store.tmdb.bySeriesId)) {
    const ownedSeasons = ownedBySeries.get(seriesId) ?? new Map();
    let count = 0;
    const seasons: MissingEntry["seasons"] = [];
    const extraEpisodes: MismatchEntry["extraEpisodes"] = [];
    const knownSeasonNumbers = new Set(tmdbEntry.seasons.map((s) => s.season));

    for (const season of tmdbEntry.seasons) {
      const owned = ownedSeasons.get(season.season) ?? new Set<number>();
      const missingNumbers = season.airedEpisodeNumbers.filter((n) => !owned.has(n));
      if (missingNumbers.length) {
        count += missingNumbers.length;
        const aired = new Set(season.airedEpisodeNumbers);
        const allNumbers = [...new Set([...season.episodeNumbers, ...season.airedEpisodeNumbers])].sort((a, b) => a - b);
        seasons.push({
          season: season.season,
          episodes: formatEpisodeRanges(missingNumbers).join(", "),
          wholeSeason: owned.size === 0,
          ended: season.episodeNumbers.length > 0 && season.airedEpisodeNumbers.length === season.episodeNumbers.length,
          count: missingNumbers.length,
          total: season.airedEpisodeNumbers.length,
          episodeStates: allNumbers.map((n) => ({
            n,
            state: owned.has(n) ? "owned" : aired.has(n) ? "missing" : "upcoming",
          })),
        });
      }

      // Owned episode numbers TMDB has never heard of for this season — more
      // episodes than the show actually has, a red flag for a bad TMDB match.
      const knownEpisodeNumbers = new Set(season.episodeNumbers);
      const extraNumbers = [...owned].filter((n) => !knownEpisodeNumbers.has(n)).sort((a, b) => a - b);
      if (extraNumbers.length) {
        extraEpisodes.push({
          season: season.season,
          episodes: formatEpisodeRanges(extraNumbers).join(", "),
          count: extraNumbers.length,
        });
      }
    }

    // Owned seasons TMDB doesn't list for this show at all (season 0/specials
    // excluded — Jellyfin routinely has those even when TMDB's specials data
    // is thin, so they're not a useful signal here).
    const extraSeasons = [...ownedSeasons.keys()]
      .filter((s) => s !== 0 && !knownSeasonNumbers.has(s))
      .sort((a, b) => a - b);

    if (count > 0) bySeriesId[seriesId] = { count, seasons };
    if (extraSeasons.length || extraEpisodes.length) {
      mismatchesBySeriesId[seriesId] = { extraSeasons, extraEpisodes };
    }
  }

  store.missing.bySeriesId = bySeriesId;
  store.missing.byCollectionId = computeMissingCollections(store);
  store.missing.syncedAt = new Date().toISOString();
  store.mismatches.bySeriesId = mismatchesBySeriesId;
  store.mismatches.syncedAt = store.missing.syncedAt;
  save();

  return {
    incompleteCount: Object.keys(bySeriesId).length,
    mismatchCount: Object.keys(mismatchesBySeriesId).length,
    incompleteCollectionCount: Object.keys(store.missing.byCollectionId).length,
    syncedAt: store.missing.syncedAt,
  };
}
