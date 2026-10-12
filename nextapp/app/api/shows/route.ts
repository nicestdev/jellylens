import type { LanguageCoverage, ShowsResponse } from "@/lib/api-types";
import { getEpisodes, getMissingShows, getShows, type LibraryEpisode } from "@/lib/store";

// How many owned episodes carry each audio language, overall and per season,
// so the Shows page can flag series that aren't fully in a language.
function languageCoverage(episodes: LibraryEpisode[]): Map<string, LanguageCoverage> {
  const byShow = new Map<string, LanguageCoverage>();
  for (const ep of episodes) {
    if (!ep.showId) continue;
    let cov = byShow.get(ep.showId);
    if (!cov) {
      cov = { total: 0, byLang: {}, seasons: [] };
      byShow.set(ep.showId, cov);
    }
    const seasonNumber = ep.season ?? 0;
    let season = cov.seasons.find((s) => s.season === seasonNumber);
    if (!season) {
      season = { season: seasonNumber, total: 0, byLang: {} };
      cov.seasons.push(season);
    }
    cov.total++;
    season.total++;
    for (const lang of ep.audioLanguages) {
      cov.byLang[lang] = (cov.byLang[lang] ?? 0) + 1;
      season.byLang[lang] = (season.byLang[lang] ?? 0) + 1;
    }
  }
  for (const cov of byShow.values()) cov.seasons.sort((a, b) => a.season - b.season);
  return byShow;
}

// The library's shows with what the missing recheck found and their audio
// languages, for Shows and the Dashboard.
export async function GET() {
  const coverage = languageCoverage(getEpisodes());
  const missing = getMissingShows();
  const items = getShows().map((item) => ({
    ...item,
    missingEpisodes: missing[item.id] || null,
    languages: coverage.get(item.id) ?? null,
  }));
  return Response.json({ items: items } satisfies ShowsResponse);
}
