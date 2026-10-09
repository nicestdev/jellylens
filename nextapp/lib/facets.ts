// Filtering and sorting helpers behind the toolbars (FilterMenu, SortMenu)
// of the library pages. Plain functions, so the pages' logic.ts can use and
// test them without React.

import { matchesWords } from "./text";

export type SortDir = "asc" | "desc";

// A copy of the set with value added or removed.
export function toggled(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// Tallies a facet's values over all items: counts[value] = items that have it.
export function countValues<T>(items: T[], valuesOf: (item: T) => string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) for (const v of valuesOf(item)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}

// A facet's values for its FilterMenu, most common first.
export function byCount(counts: Map<string, number>): string[] {
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
}

// An item passes a facet if nothing is selected or it has any selected value.
export function matchesAny(selected: Set<string>, values: string[]): boolean {
  return selected.size === 0 || values.some((v) => selected.has(v));
}

export function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return (a as number) - (b as number);
}

// A sorted copy of items by valueOf, ascending or descending.
export function sortedBy<T>(items: T[], valueOf: (item: T) => string | number, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => sign * compareValues(valueOf(a), valueOf(b)));
}

export type LibraryFilters = { query: string; genres: Set<string>; langs: Set<string> };

// What a library page (Movies, TV Shows) shows: its items by name, genre
// and language, sorted. Menu counts come from the whole library, so the
// menus don't shrink as you filter; an item matches a facet if it has any
// selected value.
export function libraryView<T extends { Name: string; Genres: string[] }>(
  items: T[],
  filters: LibraryFilters,
  langsOf: (item: T) => string[],
  sortValue: (item: T) => string | number,
  sortDir: SortDir,
) {
  const matches = matchesWords(filters.query);
  const filtered = items.filter(
    (item) => matches(item.Name) && matchesAny(filters.genres, item.Genres) && matchesAny(filters.langs, langsOf(item)),
  );
  return {
    rows: sortedBy(filtered, sortValue, sortDir),
    genreCounts: countValues(items, (i) => i.Genres),
    langCounts: countValues(items, langsOf),
    narrowed: Boolean(filters.query.trim()) || filters.genres.size > 0 || filters.langs.size > 0,
  };
}

// A value's place in an ordered list (best first), anything not in it
// after all that are.
export const rankIn =
  (list: readonly string[]) =>
  (value: string): number =>
    list.includes(value) ? list.indexOf(value) : list.length;
