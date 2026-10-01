// Filtering and sorting helpers behind the toolbars (FilterMenu, SortMenu)
// of the library pages. Plain functions, so the pages' logic.ts can use and
// test them without React.

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
