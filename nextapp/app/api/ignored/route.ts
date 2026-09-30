import { store, save, type IgnoreEntry } from "@/lib/store";

export async function GET() {
  return Response.json({ Items: store.ignored });
}

async function parseEntry(req: Request): Promise<IgnoreEntry | null> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  if (body.kind === "collection") {
    const { collectionId, movieId } = body;
    if (typeof collectionId !== "string" || !collectionId) return null;
    if (movieId !== null && !Number.isInteger(movieId)) return null;
    return { kind: "collection", collectionId, movieId: movieId as number | null };
  }
  const { kind, seriesId, season } = body;
  if (kind !== "missing" && kind !== "mismatch") return null;
  if (typeof seriesId !== "string" || !seriesId) return null;
  if (season !== null && !Number.isInteger(season)) return null;
  return { kind, seriesId, season: season as number | null };
}

function sameEntry(a: IgnoreEntry, b: IgnoreEntry): boolean {
  if (a.kind === "collection" || b.kind === "collection") {
    return (
      a.kind === "collection" &&
      b.kind === "collection" &&
      a.collectionId === b.collectionId &&
      a.movieId === b.movieId
    );
  }
  return a.kind === b.kind && a.seriesId === b.seriesId && a.season === b.season;
}

export async function POST(req: Request) {
  const entry = await parseEntry(req);
  if (!entry) return Response.json({ error: "Expected { kind, seriesId, season } or { kind: \"collection\", collectionId, movieId }." }, { status: 400 });
  if (!store.ignored.some((e) => sameEntry(e, entry))) {
    store.ignored.push(entry);
    save();
  }
  return Response.json({ Items: store.ignored });
}

export async function DELETE(req: Request) {
  const entry = await parseEntry(req);
  if (!entry) return Response.json({ error: "Expected { kind, seriesId, season } or { kind: \"collection\", collectionId, movieId }." }, { status: 400 });
  store.ignored = store.ignored.filter((e) => !sameEntry(e, entry));
  save();
  return Response.json({ Items: store.ignored });
}
