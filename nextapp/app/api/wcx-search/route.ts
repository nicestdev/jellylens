import type { WcxSearchResponse } from "@/lib/api-types";
import { TMDB_API_KEY, WCX_API_URL, WCX_URL } from "@/lib/env";
import { imdbIdOfTmdb, setWcxUid, wcxUid } from "@/lib/store";
import { fetchImdbId } from "@/lib/tmdb";

type ExternalResponse = { items?: { data?: { uid?: string }[] } };

function detailUrl(uid: string): string {
  return `${WCX_URL}/detail/${uid}`;
}

// The entry's IMDb id, which WCX is searched by: from a release's lookup if
// one came across it, else asked of TMDB. null if neither knows it;
// undefined if TMDB couldn't be asked (a miss that isn't stored).
async function imdbIdOf(mediaType: "movie" | "tv", id: number): Promise<string | null | undefined> {
  const stored = imdbIdOfTmdb(mediaType, id);
  if (stored || !TMDB_API_KEY) return stored;
  return fetchImdbId(TMDB_API_KEY, mediaType, id).catch(() => undefined);
}

const answer = (uid: string | null) => Response.json({ url: uid ? detailUrl(uid) : null } satisfies WcxSearchResponse);

// GET /api/wcx-search?tmdbId=movie:949 — the TMDB entry's page on WCX. A
// hit is stored for good, a miss for an hour (lib/store/releases.ts), so a
// panel opened again asks nobody; a failed request isn't stored.
export async function GET(req: Request) {
  const tmdbId = new URL(req.url).searchParams.get("tmdbId") ?? "";
  const m = /^(movie|tv):(\d+)$/.exec(tmdbId);
  if (!m) return Response.json({ error: "Expected tmdbId=movie:<id> or tv:<id>." }, { status: 400 });

  const known = wcxUid(tmdbId);
  if (known !== undefined) return answer(known);
  if (!WCX_API_URL) return answer(null);

  const imdbId = await imdbIdOf(m[1] as "movie" | "tv", Number(m[2]));
  if (imdbId === undefined) return answer(null);
  if (imdbId === null) {
    setWcxUid(tmdbId, null);
    return answer(null);
  }

  try {
    const res = await fetch(`${WCX_API_URL}/start/search?q=${encodeURIComponent(imdbId)}`);
    if (!res.ok) return answer(null);
    const data: ExternalResponse = await res.json();
    const uid = data.items?.data?.[0]?.uid ?? null;
    setWcxUid(tmdbId, uid);
    return answer(uid);
  } catch {
    return answer(null);
  }
}
