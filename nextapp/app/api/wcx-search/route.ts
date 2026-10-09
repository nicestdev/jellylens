import type { WcxSearchResponse } from "@/lib/api-types";
import { TMDB_API_KEY, WCX_API_URL, WCX_URL } from "@/lib/env";
import { imdbIdOfTmdb, setWcxUid, wcxUid } from "@/lib/store";
import { fetchImdbId } from "@/lib/tmdb";

type Hit = { uid?: string; type?: string; options?: { imdb_id?: string; tmdb_id?: number | string } };
type ExternalResponse = { items?: { data?: Hit[] } };

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

// WCX searches loosely: asked for one IMDb id it may answer with a different
// entry whose id is merely similar. A hit counts only if it carries the IMDb
// id searched for, or the same TMDB id on an entry of the same kind.
function isEntry(hit: Hit, imdbId: string, mediaType: "movie" | "tv", id: number): boolean {
  const o = hit.options;
  if (o?.imdb_id) return o.imdb_id === imdbId;
  return o?.tmdb_id != null && Number(o.tmdb_id) === id && (hit.type === "movie") === (mediaType === "movie");
}

const answer = (uid: string | null) => Response.json({ url: uid ? detailUrl(uid) : null } satisfies WcxSearchResponse);

// GET /api/wcx-search?tmdbId=movie:949 — the TMDB entry's page on WCX. A
// hit is stored for good, a miss for an hour (lib/store/releases.ts), so a
// title page opened again asks nobody; a failed request isn't stored.
export async function GET(req: Request) {
  const tmdbId = new URL(req.url).searchParams.get("tmdbId") ?? "";
  const m = /^(movie|tv):(\d+)$/.exec(tmdbId);
  if (!m) return Response.json({ error: "Expected tmdbId=movie:<id> or tv:<id>." }, { status: 400 });

  const known = wcxUid(tmdbId);
  if (known !== undefined) return answer(known);
  if (!WCX_API_URL) return answer(null);

  const mediaType = m[1] as "movie" | "tv";
  const id = Number(m[2]);
  const imdbId = await imdbIdOf(mediaType, id);
  if (imdbId === undefined) return answer(null);
  if (imdbId === null) {
    setWcxUid(tmdbId, null);
    return answer(null);
  }

  try {
    const res = await fetch(`${WCX_API_URL}/start/search?q=${encodeURIComponent(imdbId)}`);
    if (!res.ok) return answer(null);
    const data: ExternalResponse = await res.json();
    const uid = data.items?.data?.find((hit) => isEntry(hit, imdbId, mediaType, id))?.uid ?? null;
    setWcxUid(tmdbId, uid);
    return answer(uid);
  } catch {
    return answer(null);
  }
}
