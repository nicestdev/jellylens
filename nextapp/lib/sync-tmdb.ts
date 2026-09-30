import { fetchTmdbShow, fetchTmdbSeason, fetchTmdbCollection, fetchMovieReleases, mapWithConcurrency } from "./tmdb";
import { save, type Store, type TmdbSeriesEntry, type TmdbCollection, type CollectionPart } from "./store";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Every TMDB collection an owned movie belongs to, with all its parts —
// owned or not — so the missing recheck can tell which ones are absent.
// Parts out within the last year also get their cinema/digital/disc dates,
// so the recheck can skip ones that are only in cinemas so far.
async function syncCollections(store: Store, tmdbApiKey: string, language: string) {
  const today = todayStr();
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const countries = [...new Set([language.split("-")[1] ?? "US", "US"])];
  const ids = [...new Set(store.jellyfin.movies.map((m) => m.ProviderIds?.TmdbCollection).filter((id) => id))] as string[];

  const results = await mapWithConcurrency(ids, 5, async (id) => {
    let data;
    try {
      data = await fetchTmdbCollection(tmdbApiKey, id, language);
    } catch {
      return null;
    }
    if (!data || !Array.isArray(data.parts)) return null;

    const parts: CollectionPart[] = data.parts
      .filter((p) => !p.media_type || p.media_type === "movie")
      .map((p) => ({
        tmdbId: p.id,
        title: p.title || "",
        releaseDate: p.release_date || null,
        posterPath: p.poster_path || null,
      }))
      // TMDB lists parts in no particular order; undated ones go last.
      .sort((a, b) => (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999"));

    await mapWithConcurrency(
      parts.filter((p) => p.releaseDate && p.releaseDate >= yearAgo && p.releaseDate <= today),
      3,
      async (p) => {
        p.releases = await fetchMovieReleases(tmdbApiKey, p.tmdbId, countries).catch(() => undefined);
      }
    );

    const entry: TmdbCollection = { name: data.name || "", posterPath: data.poster_path || null, parts };
    return [id, entry] as const;
  });

  return Object.fromEntries(results.filter((r) => r !== null));
}

export async function syncTmdb(store: Store, { tmdbApiKey, language }: { tmdbApiKey: string; language: string }) {
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
  store.tmdb.byCollectionId = await syncCollections(store, tmdbApiKey, language);
  store.tmdb.syncedAt = new Date().toISOString();
  save();

  return {
    shows: Object.keys(bySeriesId).length,
    collections: Object.keys(store.tmdb.byCollectionId).length,
    syncedAt: store.tmdb.syncedAt,
  };
}
