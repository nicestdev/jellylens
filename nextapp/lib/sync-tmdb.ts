import { fetchTmdbSeason, fetchTmdbShow } from "./tmdb";
import { getTmdbShows, matchedShows, addTmdb, replaceTmdb, syncedAt, type TmdbSeason } from "./store";
import { mapWithConcurrency } from "./async";
import { refreshDetails } from "./library-scan";
import { releaseWindow } from "./dates";
import { log } from "./log";

// Asks TMDB again about every title in the library (name, genres, poster,
// a show's status; lib/library-scan.ts), then pulls, for every show, its
// seasons' episode lists. Replaces what's stored,
// except where TMDB couldn't be reached: a show whose request
// failed keeps what the last sync got, so a hiccup never turns into
// "missing" episodes. Only what TMDB no longer has (404)
// is dropped.

// A show's seasons (specials left out): aired episode numbers and all of
// them — the latter for the upcoming ones and whether a season has ended.
// null: TMDB doesn't have the show.
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
      airedEpisodeNumbers: episodes
        .filter((e) => e.air_date && e.air_date <= today)
        .map((e) => e.episode_number)
        .sort((a, b) => a - b),
      episodeNumbers: episodes.map((e) => e.episode_number).sort((a, b) => a - b),
    };
  });
  return seasons.filter((s) => s !== null);
}

export async function syncTmdb({ tmdbApiKey, language }: { tmdbApiKey: string; language: string }) {
  if (!syncedAt("library")) throw new Error("Scan the library first — no titles to look up on TMDB yet.");
  let failed = await refreshDetails({ apiKey: tmdbApiKey, language });
  const { today } = releaseWindow();
  const previousShows = getTmdbShows();

  const series = await mapWithConcurrency(matchedShows(), 5, async ({ id, tmdbId }) => {
    try {
      const seasons = await fetchSeasons(tmdbApiKey, tmdbId, today);
      return seasons ? ([id, { tmdbId, seasons }] as const) : null;
    } catch (e) {
      failed++;
      log.warn("tmdb", `Seasons of show ${tmdbId} failed, kept the last sync's`, e);
      return previousShows[id] ? ([id, previousShows[id]] as const) : null;
    }
  });

  const byShowId = Object.fromEntries(series.filter((s) => s !== null));
  const at = new Date().toISOString();
  replaceTmdb(byShowId, at);
  return { shows: Object.keys(byShowId).length, failed, syncedAt: at };
}

// After a library scan: seasons for shows that came in since the last TMDB sync, so the incomplete shows take them in
// without waiting for the next. One that fails is left for that sync.
export async function syncNewTmdb(tmdbApiKey: string) {
  const { today } = releaseWindow();
  const knownShows = getTmdbShows();

  const series = await mapWithConcurrency(
    matchedShows().filter(({ id }) => !knownShows[id]),
    5,
    async ({ id, tmdbId }) => {
      const seasons = await fetchSeasons(tmdbApiKey, tmdbId, today).catch((e) => {
        log.warn("tmdb", `Seasons of new show ${tmdbId} failed, left for the next TMDB sync`, e);
        return null;
      });
      return seasons ? ([id, { tmdbId, seasons }] as const) : null;
    },
  );
  const byShowId = Object.fromEntries(series.filter((s) => s !== null));
  addTmdb(byShowId);
  return { shows: Object.keys(byShowId).length };
}
