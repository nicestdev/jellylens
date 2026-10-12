import type { ReleasesResponse } from "@/lib/api-types";
import type { SortDir } from "@/lib/facets";

// What Discover shows of the favorite groups' releases (admins only)
// besides the grid itself (which the server filters and sorts, see
// lib/store/releases.ts): the request for it and the filter menus (the
// tiles' texts and the title page's are in lib/release-labels.ts).
// No React here, so it's tested on its own (releases.test.ts).

export type FacetKey = keyof ReleasesResponse["facets"];
type Filters = Record<FacetKey, Set<string>>;

export const SORTS = [
  { key: "date", label: "Published", defaultDir: "desc" },
  { key: "title", label: "Title", defaultDir: "asc" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

export const FACETS: { key: FacetKey; label: string; format: (v: string) => string }[] = [
  { key: "type", label: "Type", format: (v) => (v === "tv" ? "Show" : "Movie") },
  { key: "group", label: "Group", format: (v) => v },
];

export const noFilters = (): Filters => ({ type: new Set(), group: new Set() });

// The /api/releases request for one page of the grid.
export function releasesUrl(
  query: string,
  filters: Filters,
  sortKey: SortKey,
  sortDir: SortDir,
  offset: number,
): string {
  const qs = new URLSearchParams({ q: query.trim(), sort: sortKey, dir: sortDir, offset: String(offset) });
  for (const key of Object.keys(filters) as FacetKey[]) for (const v of filters[key]) qs.append(key, v);
  return "/api/releases?" + qs;
}

// A facet's menu entries, as the server lists them (movie before tv,
// groups A→Z). One with a single
// value (just one group, say) has nothing to pick from, so it's
// left out unless something in it is selected.
export function facetValues(key: FacetKey, values: string[], selected: Set<string>): string[] {
  if (values.length <= 1 && selected.size === 0) return [];
  return values;
}
