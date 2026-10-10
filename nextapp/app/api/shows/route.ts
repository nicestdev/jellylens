import type { LanguageCoverage, ShowsResponse } from "@/lib/api-types";
import { getEpisodes, getMismatches, getMissingSeries, getShows, type LibraryEpisode } from "@/lib/store";

// How many owned episodes carry each audio language, overall and per season,
// so the Shows page can flag series that aren't fully in a language.
function languageCoverage(episodes: LibraryEpisode[]): Map<string, LanguageCoverage> {
  const bySeries = new Map<string, LanguageCoverage>();
  for (const ep of episodes) {
    if (!ep.SeriesId) continue;
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

// The library's shows with what the missing recheck found and their audio
// languages, for the TV Shows and Missing pages.
export async function GET() {
  const coverage = languageCoverage(getEpisodes());
  const missing = getMissingSeries();
  const mismatches = getMismatches();
  const items = getShows().map((item) => ({
    ...item,
    MissingEpisodes: missing[item.Id] || null,
    Mismatches: mismatches[item.Id] || null,
    Languages: coverage.get(item.Id) ?? null,
  }));
  return Response.json({ Items: items } satisfies ShowsResponse);
}
