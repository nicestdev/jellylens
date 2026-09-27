import { fetchTmdbShow, fetchTmdbSeason, mapWithConcurrency } from "./tmdb";
import { save, type Store, type TmdbSeriesEntry } from "./store";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function syncTmdb(store: Store, { tmdbApiKey }: { tmdbApiKey: string }) {
  if (!store.jellyfin.syncedAt) {
    throw new Error("Sync Jellyfin first — no series to look up on TMDB yet.");
  }

  const withTmdb = store.jellyfin.shows.filter((s) => s.ProviderIds?.Tmdb);
  const today = todayStr();

  const results = await mapWithConcurrency(withTmdb, 5, async (s) => {
    const tmdbId = s.ProviderIds!.Tmdb!;
    let tmdbShow;
    try {
      tmdbShow = await fetchTmdbShow(tmdbApiKey, tmdbId);
    } catch {
      return null;
    }
    if (!tmdbShow || !Array.isArray(tmdbShow.seasons)) return null;

    const realSeasons = tmdbShow.seasons.filter((season) => season.season_number !== 0);

    const seasons = await mapWithConcurrency(realSeasons, 5, async (season) => {
      let seasonData;
      try {
        seasonData = await fetchTmdbSeason(tmdbApiKey, tmdbId, season.season_number);
      } catch {
        return null;
      }
      if (!seasonData || !Array.isArray(seasonData.episodes)) return null;

      const airedEpisodeNumbers = seasonData.episodes
        .filter((ep) => ep.air_date && ep.air_date <= today)
        .map((ep) => ep.episode_number)
        .sort((a, b) => a - b);

      // All episode numbers TMDB knows for this season, aired or not — used
      // to spot episodes Jellyfin owns that don't exist on TMDB at all
      // (usually a sign the show is matched to the wrong TMDB id).
      const episodeNumbers = seasonData.episodes.map((ep) => ep.episode_number).sort((a, b) => a - b);

      return { season: season.season_number, airedEpisodeNumbers, episodeNumbers };
    });

    return { id: s.Id, tmdbId, seasons: seasons.filter((x) => x !== null) };
  });

  const bySeriesId: Record<string, TmdbSeriesEntry> = {};
  for (const r of results) {
    if (r) bySeriesId[r.id] = { tmdbId: r.tmdbId, seasons: r.seasons };
  }

  store.tmdb.bySeriesId = bySeriesId;
  store.tmdb.syncedAt = new Date().toISOString();
  save();

  return { shows: Object.keys(bySeriesId).length, syncedAt: store.tmdb.syncedAt };
}
