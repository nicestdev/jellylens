import type { CollectionResponse } from "@/lib/api-types";
import { libraryIndex, libraryRef } from "@/lib/store";
import { withoutSharedPrefix } from "@/lib/title-rows";
import { withAvailability } from "@/lib/availability";
import { fetchMovieCollection } from "@/lib/tmdb";
import { TMDB_API_KEY, TMDB_LANGUAGE } from "@/lib/env";

type Params = { params: Promise<{ key: string }> };

// Kept an hour (on globalThis, so it survives dev reloads and tests can
// reset it): going back and forth between a collection's title pages asks
// TMDB once a movie.
const TTL_MS = 60 * 60 * 1000;
const g = globalThis as unknown as {
  __movieCollection?: Map<number, { at: number; value: CollectionResponse["collection"] }>;
};

// A movie's collection, every part (this one too) by release date, owned or
// not and how far out (as on Discover); null without one.
async function collectionOf(tmdbId: number): Promise<CollectionResponse["collection"]> {
  const cache = (g.__movieCollection ??= new Map());
  const hit = cache.get(tmdbId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const found = await fetchMovieCollection(TMDB_API_KEY, tmdbId, TMDB_LANGUAGE);
  const index = libraryIndex();
  const parts = (found?.parts ?? [])
    .sort((a, b) => (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999"))
    .map((p) => ({ ...p, library: libraryRef(index.get("movie:" + p.tmdbId)) }));
  const value =
    found && parts.length > 1
      ? { name: found.name, items: withoutSharedPrefix(await withAvailability(parts, TMDB_API_KEY, TMDB_LANGUAGE)) }
      : null;
  cache.set(tmdbId, { at: Date.now(), value });
  return value;
}

// GET /api/releases/movie:<id>/collection — the title page's collection,
// asked for on its own so the releases never wait for TMDB; admin only.
export async function GET(_req: Request, { params }: Params) {
  const { key } = await params;
  const movie = key.match(/^movie:(\d+)$/);
  if (!movie || !TMDB_API_KEY) return Response.json({ collection: null } satisfies CollectionResponse);
  try {
    return Response.json({ collection: await collectionOf(Number(movie[1])) } satisfies CollectionResponse);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
