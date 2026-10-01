import type { LanguageCoverage, ShowItem } from "@/lib/api-types";
import { countValues, matchesAny, sortedBy, type SortDir } from "@/lib/facets";
import { plural, seasonLabel } from "@/lib/format";
import { languageName } from "@/lib/languages";

// What the TV Shows page shows: the library filtered, sorted, the counts for
// its filter menus and the tiles' texts. No React here, so it's tested on
// its own (logic.test.ts).

export const SORTS = [
  { key: "title", label: "Title", defaultDir: "asc" },
  { key: "year", label: "Year", defaultDir: "desc" },
  { key: "seasons", label: "Seasons", defaultDir: "desc" },
  { key: "episodes", label: "Episodes", defaultDir: "desc" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

function sortValue(item: ShowItem, key: SortKey): string | number {
  switch (key) {
    case "title": return item.Name.toLowerCase();
    case "year": return item.ProductionYear ?? 0;
    case "seasons": return item.ChildCount ?? 0;
    case "episodes": return item.RecursiveItemCount ?? 0;
  }
}

// A show counts for a language if any episode has it.
const languagesOf = (s: ShowItem) => Object.keys(s.Languages?.byLang ?? {});

export type ShowFilters = { query: string; statuses: Set<string>; genres: Set<string>; langs: Set<string> };

// Menu counts come from the whole library, so the menus don't shrink as
// you filter. A show matches a facet if it has any selected value.
export function showView(shows: ShowItem[], filters: ShowFilters, sortKey: SortKey, sortDir: SortDir) {
  const q = filters.query.trim().toLowerCase();
  const filtered = shows.filter(
    (item) =>
      (!q || item.Name.toLowerCase().includes(q)) &&
      matchesAny(filters.statuses, [item.Status ?? ""]) &&
      matchesAny(filters.genres, item.Genres) &&
      matchesAny(filters.langs, languagesOf(item))
  );
  return {
    rows: sortedBy(filtered, (s) => sortValue(s, sortKey), sortDir),
    statusCounts: countValues(shows, (s) => (s.Status ? [s.Status] : [])),
    genreCounts: countValues(shows, (s) => s.Genres),
    langCounts: countValues(shows, languagesOf),
    narrowed: Boolean(q) || filters.statuses.size > 0 || filters.genres.size > 0 || filters.langs.size > 0,
    totalEpisodes: shows.reduce((sum, s) => sum + (s.RecursiveItemCount ?? 0), 0),
  };
}

// Year plus seasons under the poster; episodes instead while sorting by
// them — all three don't fit on a tile.
export function showMeta(item: ShowItem, sortKey: SortKey): string {
  const count =
    sortKey === "episodes"
      ? item.RecursiveItemCount && plural(item.RecursiveItemCount, "episode")
      : item.ChildCount && plural(item.ChildCount, "season");
  return [item.ProductionYear, count].filter(Boolean).join(" · ");
}

// With a language filter active, a show that has the language in only some
// episodes gets a red badge ("EN 45/48") — red as in "missing", like on the
// Missing page; hovering it lists the seasons that fall short. Complete shows
// get no badge.
export function languageBadge(cov: LanguageCoverage | null | undefined, selected: Set<string>) {
  if (!cov) return undefined;
  for (const lang of selected) {
    const have = cov.byLang[lang] ?? 0;
    if (have === 0 || have >= cov.total) continue;
    const gaps = cov.seasons
      .filter((s) => (s.byLang[lang] ?? 0) < s.total)
      .map((s) => `${seasonLabel(s.season)}: ${s.byLang[lang] ?? 0}/${s.total}`);
    return {
      label: `${lang} ${have}/${cov.total}`,
      tone: "destructive" as const,
      hint: [`${languageName(lang)} in ${have} of ${cov.total} episodes`, ...gaps].join("\n"),
    };
  }
  return undefined;
}
