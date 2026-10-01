import type { MovieItem } from "@/lib/api-types";
import { countValues, matchesAny, sortedBy, type SortDir } from "@/lib/facets";

// What the Movies page shows: the library filtered, sorted, and the counts
// for its filter menus. No React here, so it's tested on its own
// (logic.test.ts).

export function resolutionLabel(width?: number, height?: number): string {
  const w = width || 0, h = height || 0;
  if (!w && !h) return "";
  if (w >= 3800 || h >= 2100) return "4K";
  if (w >= 1900 || h >= 1060) return "1080p";
  if (w >= 1260 || h >= 700) return "720p";
  return "SD";
}

// "2010 · 148 min" under the poster.
export function movieMeta(item: MovieItem): string {
  const minutes = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600000000) : null;
  return [item.ProductionYear, minutes ? `${minutes} min` : null].filter(Boolean).join(" · ");
}

// Title sorts A→Z first; the numeric keys start with the longest/newest,
// which is almost always what you want when you pick them. File size is left
// out on purpose — it doesn't matter for browsing.
export const SORTS = [
  { key: "title", label: "Title", defaultDir: "asc" },
  { key: "year", label: "Year", defaultDir: "desc" },
  { key: "duration", label: "Runtime", defaultDir: "desc" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

function sortValue(item: MovieItem, key: SortKey): string | number {
  switch (key) {
    case "title": return item.Name.toLowerCase();
    case "year": return item.ProductionYear ?? 0;
    case "duration": return item.RunTimeTicks ?? 0;
  }
}

export type MovieFilters = { query: string; genres: Set<string>; langs: Set<string> };

// Menu counts come from the whole library, so the menus don't shrink as
// you filter. A movie matches a facet if it has any selected value.
export function movieView(movies: MovieItem[], filters: MovieFilters, sortKey: SortKey, sortDir: SortDir) {
  const q = filters.query.trim().toLowerCase();
  const filtered = movies.filter(
    (item) =>
      (!q || item.Name.toLowerCase().includes(q)) &&
      matchesAny(filters.genres, item.Genres) &&
      matchesAny(filters.langs, item.AudioLanguages)
  );
  return {
    rows: sortedBy(filtered, (m) => sortValue(m, sortKey), sortDir),
    genreCounts: countValues(movies, (m) => m.Genres),
    langCounts: countValues(movies, (m) => m.AudioLanguages),
    narrowed: Boolean(q) || filters.genres.size > 0 || filters.langs.size > 0,
  };
}
