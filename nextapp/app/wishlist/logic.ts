import type { RequestItem } from "@/lib/api-types";
import { sortedBy, type SortDir } from "@/lib/facets";

// How the Wishlist sorts its posters. Wanted (how many asked) only means
// something on an admin's overview of everyone's; Added is the latest
// request for it, Title A→Z.
export const WISHLIST_SORTS = [
  { key: "wanted", label: "Wanted", defaultDir: "desc" },
  { key: "added", label: "Added", defaultDir: "desc" },
  { key: "title", label: "Title", defaultDir: "asc" },
] as const;
export type WishlistSortKey = (typeof WISHLIST_SORTS)[number]["key"];

export const sortsFor = (overview: boolean) => WISHLIST_SORTS.filter((s) => overview || s.key !== "wanted");

// When it was last asked for (by anyone on the overview).
export const latestRequest = (r: Pick<RequestItem, "requestedAt" | "requesters">) =>
  r.requesters?.reduce((latest, q) => (q.requestedAt > latest ? q.requestedAt : latest), "") ?? r.requestedAt;

// The Type filter: movies, shows, or (none picked) both.
export const TYPES = ["movie", "tv"] as const;
export const typeLabel = (t: string) => (t === "movie" ? "Movies" : "Shows");
export const ofTypes = (types: Set<string>) => (r: Pick<RequestItem, "mediaType">) =>
  types.size === 0 || types.has(r.mediaType);

// Ties go to the latest request, then the title.
export function sortWishlist(items: RequestItem[], key: WishlistSortKey, dir: SortDir): RequestItem[] {
  const byTitle = sortedBy(items, (r) => r.title.toLowerCase(), "asc");
  const byAdded = sortedBy(byTitle, latestRequest, "desc");
  if (key === "title") return sortedBy(items, (r) => r.title.toLowerCase(), dir);
  if (key === "added") return sortedBy(byTitle, latestRequest, dir);
  return sortedBy(byAdded, (r) => r.requesters?.length ?? 1, dir);
}
