import { TMDB_API_KEY } from "@/lib/env";
import { imdbIdOfTmdb } from "@/lib/store";
import { fetchImdbId } from "@/lib/tmdb";

// GET /api/funxd-link?tmdbId=movie:949&title=… — redirects to FunXD's search
// (a WordPress site) for the entry's IMDb id (from a release's lookup, else
// TMDB's), or for the title when there is none.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const m = /^(movie|tv):(\d+)$/.exec(params.get("tmdbId") ?? "");
  if (!m) return Response.json({ error: "Expected tmdbId=movie:<id> or tv:<id>." }, { status: 400 });

  const mediaType = m[1] as "movie" | "tv";
  const id = Number(m[2]);
  const imdbId = await (async () =>
    imdbIdOfTmdb(mediaType, id) ?? (TMDB_API_KEY ? await fetchImdbId(TMDB_API_KEY, mediaType, id) : null))().catch(
    () => null,
  );
  return Response.redirect(
    "https://funxd.site/?" + new URLSearchParams({ s: imdbId ?? params.get("title") ?? "" }),
    302,
  );
}
