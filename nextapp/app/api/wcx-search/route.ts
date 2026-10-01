import type { WcxSearchResponse } from "@/lib/api-types";
import { WCX_API_URL, WCX_URL } from "@/lib/env";
import { setWcxUid, wcxUid } from "@/lib/store";

type ExternalResponse = { items?: { data?: { uid?: string }[] } };

function detailUrl(uid: string): string {
  return `${WCX_URL}/detail/${uid}`;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q");
  const tmdbId = params.get("tmdbId");
  if (!q || !tmdbId) return Response.json({ error: "Missing q or tmdbId parameter." }, { status: 400 });

  const stored = wcxUid(tmdbId);
  if (stored) return Response.json({ url: detailUrl(stored) } satisfies WcxSearchResponse);

  if (!WCX_API_URL) return Response.json({ url: null } satisfies WcxSearchResponse);

  try {
    const res = await fetch(`${WCX_API_URL}/start/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return Response.json({ url: null } satisfies WcxSearchResponse);
    const data: ExternalResponse = await res.json();
    const uid = data.items?.data?.[0]?.uid ?? null;
    if (uid) setWcxUid(tmdbId, uid);
    return Response.json({ url: uid ? detailUrl(uid) : null } satisfies WcxSearchResponse);
  } catch {
    return Response.json({ url: null } satisfies WcxSearchResponse);
  }
}
