import type { MovieItem } from "@/lib/api-types";
import { libraryView, type LibraryFilters, type SortDir } from "@/lib/facets";

// What the Movies page shows: the library filtered, sorted, and the counts
// for its filter menus. No React here, so it's tested on its own
// (logic.test.ts).

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
    case "title":
      return item.Name.toLowerCase();
    case "year":
      return item.ProductionYear ?? 0;
    case "duration":
      return item.RunTimeTicks ?? 0;
  }
}

// The library filtered and sorted, and the counts for its filter menus.
export const movieView = (movies: MovieItem[], filters: LibraryFilters, sortKey: SortKey, sortDir: SortDir) =>
  libraryView(
    movies,
    filters,
    (m) => m.AudioLanguages,
    (m) => sortValue(m, sortKey),
    sortDir,
  );
