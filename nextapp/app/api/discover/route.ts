import type { DiscoverResponse } from "@/lib/api-types";
import { TMDB_API_KEY } from "@/lib/env";
import { fetchTmdbTrending, searchTmdb } from "@/lib/tmdb";
import { ensureMetadataLanguage } from "@/lib/sync-manager";
import { libraryIndex, libraryRef } from "@/lib/store";
import { withAvailability } from "@/lib/availability";

// Three full rows of the widest poster grid.
const TRENDING_LIMIT = 18;

// TMDB search for the Requests page (?q=…), or this week's trending movies
// and shows when there's no query. Proxied so the API key stays server-side.
// Search results say whether each one is already in the library ("do I have
// this?"); trending leaves owned ones out, since there's nothing to request.
// Both say how far along the release is (see withAvailability).
export async function GET(req: Request) {
  if (!TMDB_API_KEY) return Response.json({ error: "TMDB_API_KEY is not configured on the backend." }, { status: 500 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  try {
    const language = await ensureMetadataLanguage();
    const index = libraryIndex();
    const withLibrary = <T extends { mediaType: string; tmdbId: number }>(r: T) => ({
      ...r,
      library: libraryRef(index.get(r.mediaType + ":" + r.tmdbId)),
    });

    let items;
    if (q) {
      items = (await searchTmdb(TMDB_API_KEY, q, language)).map(withLibrary);
    } else {
      // Two pages, because a good share of what's trending tends to be owned.
      // TMDB's pages can overlap by an item, hence the dedupe.
      const pages = await Promise.all([1, 2].map((p) => fetchTmdbTrending(TMDB_API_KEY, language, p)));
      const seen = new Set<string>();
      items = pages
        .flat()
        .filter((r) => !seen.has(r.mediaType + ":" + r.tmdbId) && seen.add(r.mediaType + ":" + r.tmdbId))
        .map(withLibrary)
        .filter((r) => !r.library)
        .slice(0, TRENDING_LIMIT);
    }
    return Response.json({ Items: await withAvailability(items, TMDB_API_KEY, language) } satisfies DiscoverResponse);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
