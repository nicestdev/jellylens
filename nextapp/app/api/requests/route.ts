import { store, save, type RequestEntry } from "@/lib/store";
import { TMDB_API_KEY } from "@/lib/env";
import { ensureMetadataLanguage } from "@/lib/sync-manager";
import { libraryIndex, libraryRef, withAvailability } from "@/lib/requests";

async function listResponse() {
  const index = libraryIndex(store);
  const items = store.requests.map((r) => ({ ...r, library: libraryRef(index.get(r.mediaType + ":" + r.tmdbId)) }));
  if (!TMDB_API_KEY) return Response.json({ Items: items.map((r) => ({ ...r, availability: null })) });
  return Response.json({ Items: await withAvailability(items, TMDB_API_KEY, await ensureMetadataLanguage()) });
}

export async function GET() {
  return listResponse();
}

type Body = { mediaType: RequestEntry["mediaType"]; tmdbId: number; [field: string]: unknown };

async function readBody(req: Request): Promise<Body | null> {
  try {
    const body = await req.json();
    const { mediaType, tmdbId } = body;
    if (mediaType !== "movie" && mediaType !== "tv") return null;
    if (!Number.isInteger(tmdbId)) return null;
    return body;
  } catch {
    return null;
  }
}

const same = (a: { mediaType: unknown; tmdbId: unknown }, b: { mediaType: unknown; tmdbId: unknown }) =>
  a.mediaType === b.mediaType && a.tmdbId === b.tmdbId;

export async function POST(req: Request) {
  const body = await readBody(req);
  if (!body || typeof body.title !== "string" || !body.title) {
    return Response.json({ error: "Expected { mediaType, tmdbId, title, year, posterPath }." }, { status: 400 });
  }
  if (!store.requests.some((r) => same(r, body))) {
    const entry: RequestEntry = {
      mediaType: body.mediaType,
      tmdbId: body.tmdbId,
      title: body.title,
      year: Number.isInteger(body.year) ? (body.year as number) : null,
      releaseDate: typeof body.releaseDate === "string" ? body.releaseDate : null,
      posterPath: typeof body.posterPath === "string" ? body.posterPath : null,
      requestedAt: new Date().toISOString(),
    };
    store.requests.push(entry);
    save();
  }
  return listResponse();
}

export async function DELETE(req: Request) {
  const body = await readBody(req);
  if (!body) return Response.json({ error: "Expected { mediaType, tmdbId }." }, { status: 400 });
  store.requests = store.requests.filter((r) => !same(r, body));
  save();
  return listResponse();
}
