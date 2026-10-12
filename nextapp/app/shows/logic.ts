import type { ShowItem } from "@/lib/api-types";
import { libraryView, type LibraryFilters, type SortDir } from "@/lib/facets";
import { plural } from "@/lib/format";

// What the Shows page shows: the library filtered, sorted, the counts for
// its filter menus and the tiles' texts. No React here, so it's tested on
// its own (logic.test.ts).

export const SORTS = [
  { key: "title", label: "Title", defaultDir: "asc" },
  { key: "year", label: "Year", defaultDir: "desc" },
  { key: "seasons", label: "Seasons", defaultDir: "desc" },
  { key: "episodes", label: "Episodes", defaultDir: "desc" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

function sortValue(item: ShowItem, key: SortKey): string | number {
  switch (key) {
    case "title":
      return item.name.toLowerCase();
    case "year":
      return item.year ?? 0;
    case "seasons":
      return item.seasonCount ?? 0;
    case "episodes":
      return item.episodeCount ?? 0;
  }
}

// A show counts for a language if any episode has it.
const languagesOf = (s: ShowItem) => Object.keys(s.languages?.byLang ?? {});

// The library filtered and sorted, the counts for its filter menus, and
// every show's episodes together.
export function showView(shows: ShowItem[], filters: LibraryFilters, sortKey: SortKey, sortDir: SortDir) {
  return {
    ...libraryView(shows, filters, languagesOf, (s) => sortValue(s, sortKey), sortDir),
    totalEpisodes: shows.reduce((sum, s) => sum + (s.episodeCount ?? 0), 0),
  };
}

// Year plus seasons under the poster; episodes instead while sorting by
// them — all three don't fit on a tile. As values, shown with Dots.
export function showMeta(item: ShowItem, sortKey: SortKey): (string | number | null | undefined)[] {
  const count =
    sortKey === "episodes"
      ? item.episodeCount && plural(item.episodeCount, "episode")
      : item.seasonCount && plural(item.seasonCount, "season");
  return [item.year, count || null];
}
