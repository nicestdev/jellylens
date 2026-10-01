import {
  fetchMovieReleases,
  fetchTmdbCollection,
  fetchTmdbSeason,
  fetchTmdbShow,
  releaseCountries,
  type TmdbCollectionData,
} from "./tmdb";
import {
  collectionIds,
  getTmdbCollections,
  getTmdbSeries,
  matchedShows,
  replaceTmdb,
  syncedAt,
  type CollectionPart,
  type TmdbCollection,
  type TmdbSeason,
} from "./store";
import { mapWithConcurrency } from "./async";
import { releaseWindow } from "./dates";

// Pulls, for every show matched to TMDB, its seasons' episode lists, and
// every TMDB collection an owned movie belongs to. Replaces what's stored,
// except where TMDB couldn't be reached: a show or collection whose request
// failed keeps what the last sync got, so a hiccup never turns into
// "missing" (or "mismatched") episodes. Only what TMDB no longer has (404)
// is dropped.

// A show's seasons (specials left out): aired episode numbers and all of
// them — the latter to spot owned episodes TMDB doesn't know, usually a sign
// of a wrong TMDB match. null: TMDB doesn't have the show.
async function fetchSeasons(apiKey: string, tmdbId: string, today: string): Promise<TmdbSeason[] | null> {
  const show = await fetchTmdbShow(apiKey, tmdbId);
  if (!show) return null;
  const numbers = (show.seasons ?? []).map((s) => s.season_number).filter((n) => n !== 0);
  const seasons = await mapWithConcurrency(numbers, 5, async (season): Promise<TmdbSeason | null> => {
    const data = await fetchTmdbSeason(apiKey, tmdbId, season);
    if (!data) return null;
    const episodes = data.episodes ?? [];
    return {
      season,
      airedEpisodeNumbers: episodes.filter((e) => e.air_date && e.air_date <= today).map((e) => e.episode_number).sort((a, b) => a - b),
      episodeNumbers: episodes.map((e) => e.episode_number).sort((a, b) => a - b),
    };
  });
  return seasons.filter((s) => s !== null);
}

// A collection's movie parts, sorted by release date (undated last). Parts
// out within the last year also get their cinema/digital/disc dates, so the
// missing recheck can skip ones only in cinemas so far; if those can't be
// fetched, the last sync's stay.
async function toCollection(
  apiKey: string,
  data: TmdbCollectionData,
  previous: TmdbCollection | undefined,
  countries: string[]
): Promise<TmdbCollection> {
  const { today, yearAgo } = releaseWindow();
  const parts: CollectionPart[] = (data.parts ?? [])
    .filter((p) => !p.media_type || p.media_type === "movie")
    .map((p) => ({ tmdbId: p.id, title: p.title || "", releaseDate: p.release_date || null, posterPath: p.poster_path || null }))
    .sort((a, b) => (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999"));

  const recent = parts.filter((p) => p.releaseDate && p.releaseDate >= yearAgo && p.releaseDate <= today);
  await mapWithConcurrency(recent, 3, async (p) => {
    p.releases = await fetchMovieReleases(apiKey, p.tmdbId, countries).catch(
      () => previous?.parts.find((old) => old.tmdbId === p.tmdbId)?.releases
    );
  });
  return { name: data.name || "", posterPath: data.poster_path || null, parts };
}

export async function syncTmdb({ tmdbApiKey, language }: { tmdbApiKey: string; language: string }) {
  if (!syncedAt("jellyfin")) throw new Error("Sync Jellyfin first — no series to look up on TMDB yet.");
  const { today } = releaseWindow();
  const countries = releaseCountries(language);
  const previousSeries = getTmdbSeries();
  const previousCollections = getTmdbCollections();
  let failed = 0;

  const series = await mapWithConcurrency(matchedShows(), 5, async ({ id, tmdbId }) => {
    try {
      const seasons = await fetchSeasons(tmdbApiKey, tmdbId, today);
      return seasons ? ([id, { tmdbId, seasons }] as const) : null;
    } catch {
      failed++;
      return previousSeries[id] ? ([id, previousSeries[id]] as const) : null;
    }
  });

  const collections = await mapWithConcurrency(collectionIds(), 5, async (id) => {
    try {
      const data = await fetchTmdbCollection(tmdbApiKey, id, language);
      return data ? ([id, await toCollection(tmdbApiKey, data, previousCollections[id], countries)] as const) : null;
    } catch {
      failed++;
      return previousCollections[id] ? ([id, previousCollections[id]] as const) : null;
    }
  });

  const bySeriesId = Object.fromEntries(series.filter((s) => s !== null));
  const byCollectionId = Object.fromEntries(collections.filter((c) => c !== null));
  const at = new Date().toISOString();
  replaceTmdb(bySeriesId, byCollectionId, at);
  return { shows: Object.keys(bySeriesId).length, collections: Object.keys(byCollectionId).length, failed, syncedAt: at };
}
