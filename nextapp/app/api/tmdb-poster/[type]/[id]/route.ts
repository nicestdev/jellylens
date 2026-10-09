import { TMDB_API_KEY } from "@/lib/env";
import { setMatchPoster } from "@/lib/store";
import { ensureMetadataLanguage } from "@/lib/sync-manager";
import { fetchTmdbEntry } from "@/lib/tmdb";

// When each entry was last asked for, so a poster TMDB still lacks costs
// one call an hour, not one per page view. On globalThis, looked up on
// every use, so tests can drop it (test/state.ts).
const globalForPosters = globalThis as unknown as { __tmdbPosterTries?: Map<string, number> };
const triedMap = () => (globalForPosters.__tmdbPosterTries ??= new Map());
const HOUR = 60 * 60 * 1000;

// GET /api/tmdb-poster/<movie|tv>/<id> — the poster of a title matched
// before TMDB had one (a premiere often reaches xREL first): asks TMDB
// again, keeps what it finds for the release titles, and redirects to the
// cached image. 404 while there's still none. Build URLs with tmdbPoster()
// in lib/api-client.ts.
export async function GET(_req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if ((type !== "movie" && type !== "tv") || !/^\d{1,10}$/.test(id))
    return new Response("Bad poster request", { status: 400 });
  const key = `${type}:${id}`;
  const tried = triedMap();
  const last = tried.get(key);
  if (!TMDB_API_KEY || (last && Date.now() - last < HOUR)) return new Response("No poster", { status: 404 });
  tried.set(key, Date.now());
  const entry = await fetchTmdbEntry(TMDB_API_KEY, type, Number(id), await ensureMetadataLanguage()).catch(() => null);
  if (!entry?.posterPath) return new Response("No poster", { status: 404 });
  tried.delete(key);
  setMatchPoster(type, Number(id), entry.posterPath, entry.year);
  return new Response(null, { status: 302, headers: { Location: `/api/tmdb-image/w342${entry.posterPath}` } });
}
