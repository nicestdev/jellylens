import type { ReleasesResponse } from "@/lib/api-types";
import { rankIn, type SortDir } from "@/lib/facets";
import { formatNumber, plural } from "@/lib/format";
import { qualityLabel } from "@/lib/release-labels";

// What the Releases page shows besides the grid itself (which the server
// filters and sorts, see lib/store/releases.ts): the request for it, the
// filter menus, the tiles' badges (their texts and the title page's are
// in lib/release-labels.ts).
// No React here, so it's tested on its own (logic.test.ts).

export type FacetKey = keyof ReleasesResponse["facets"];
type Filters = Record<FacetKey, Set<string>>;

export const SORTS = [
  { key: "date", label: "Published", defaultDir: "desc" },
  { key: "title", label: "Title", defaultDir: "asc" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

export const FACETS: { key: FacetKey; label: string; format: (v: string) => string }[] = [
  { key: "group", label: "Group", format: (v) => v },
  { key: "quality", label: "Quality", format: qualityLabel },
];

export const noFilters = (): Filters => ({ group: new Set(), quality: new Set() });

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

// Qualities best first (4K, 1080p, 720p), then the rest A→Z.
const rank = rankIn(["HD-2160p", "HD-1080p", "HD-720p"]);
function byQuality(values: string[]): string[] {
  return [...values].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// A facet's menu entries, as the server lists them (groups in the order
// they were added, the rest A→Z), qualities best first. One with a single
// value (just one group, say) has nothing to pick from, so it's
// left out unless something in it is selected.
export function facetValues(key: FacetKey, values: string[], selected: Set<string>): string[] {
  if (values.length <= 1 && selected.size === 0) return [];
  return key === "quality" ? byQuality(values) : values;
}

// The line under the page title.
export function subtitle(data: ReleasesResponse | null, narrowed: boolean): string {
  if (!data) return "Loading…";
  if (data.groups === 0) return "P2P releases of your favorite groups, from xREL.";
  if (narrowed) return `${formatNumber(data.matched)} of ${formatNumber(data.total)} titles`;
  return `${formatNumber(data.total)} titles from ${plural(data.groups, "group")}`;
}
