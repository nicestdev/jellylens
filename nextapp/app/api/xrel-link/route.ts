import { TMDB_API_KEY } from "@/lib/env";
import { imdbIdOfTmdb } from "@/lib/store";
import { fetchImdbId } from "@/lib/tmdb";
import { findTitleLink } from "@/lib/xrel";

// GET /api/xrel-link?tmdbId=movie:949&title=… — redirects to the entry's
// page on xREL, found by its IMDb id (from a release's lookup, else TMDB's),
// or to xREL's search for the title when that finds none or fails. Asked
// only on a click, so nothing is kept.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const m = /^(movie|tv):(\d+)$/.exec(params.get("tmdbId") ?? "");
  if (!m) return Response.json({ error: "Expected tmdbId=movie:<id> or tv:<id>." }, { status: 400 });

  const mediaType = m[1] as "movie" | "tv";
  const id = Number(m[2]);
  const link = await (async () => {
    const imdbId =
      imdbIdOfTmdb(mediaType, id) ?? (TMDB_API_KEY ? await fetchImdbId(TMDB_API_KEY, mediaType, id) : null);
    return imdbId ? findTitleLink(imdbId) : null;
  })().catch(() => null);
  const search =
    "https://www.xrel.to/search.html?" + new URLSearchParams({ xrel_search_query: params.get("title") ?? "" });
  return Response.redirect(link ?? search, 302);
}
