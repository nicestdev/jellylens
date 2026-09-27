import { store, type JellyfinEpisode } from "@/lib/store";

// How many owned episodes carry each audio language, overall and per season,
// so the Shows page can flag series that aren't fully in a language.
type LanguageCoverage = {
  total: number;
  byLang: Record<string, number>;
  seasons: { season: number; total: number; byLang: Record<string, number> }[];
};

function languageCoverage(episodes: JellyfinEpisode[]): Map<string, LanguageCoverage> {
  const bySeries = new Map<string, LanguageCoverage>();
  for (const ep of episodes) {
    // Episodes synced before AudioLanguages existed carry no data at all;
    // skip them rather than counting them as "no language".
    if (!ep.SeriesId || !ep.AudioLanguages) continue;
    let cov = bySeries.get(ep.SeriesId);
    if (!cov) {
      cov = { total: 0, byLang: {}, seasons: [] };
      bySeries.set(ep.SeriesId, cov);
    }
    const seasonNumber = ep.ParentIndexNumber ?? 0;
    let season = cov.seasons.find((s) => s.season === seasonNumber);
    if (!season) {
      season = { season: seasonNumber, total: 0, byLang: {} };
      cov.seasons.push(season);
    }
    cov.total++;
    season.total++;
    for (const lang of ep.AudioLanguages) {
      cov.byLang[lang] = (cov.byLang[lang] ?? 0) + 1;
      season.byLang[lang] = (season.byLang[lang] ?? 0) + 1;
    }
  }
  for (const cov of bySeries.values()) cov.seasons.sort((a, b) => a.season - b.season);
  return bySeries;
}

// Only what the Shows and Missing pages use, instead of passing the raw
// Jellyfin items (blur hashes, user data, …) through.
export async function GET() {
  const coverage = languageCoverage(store.jellyfin.episodes);
  const items = store.jellyfin.shows.map((item) => ({
    Id: item.Id,
    Name: item.Name,
    ServerId: item.ServerId,
    ProductionYear: item.ProductionYear,
    ProviderIds: { Tmdb: item.ProviderIds?.Tmdb },
    ImageTags: { Primary: (item.ImageTags as { Primary?: string } | undefined)?.Primary },
    Status: item.Status,
    ChildCount: item.ChildCount,
    RecursiveItemCount: item.RecursiveItemCount,
    Genres: item.Genres,
    MissingEpisodes: store.missing.bySeriesId[item.Id] || null,
    Mismatches: store.mismatches.bySeriesId[item.Id] || null,
    Languages: coverage.get(item.Id) ?? null,
  }));
  return Response.json({ Items: items });
}
