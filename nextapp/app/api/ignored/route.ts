import type { IgnoredResponse } from "@/lib/api-types";
import { addIgnored, listIgnored, removeIgnored, type IgnoreEntry } from "@/lib/store";

export async function GET() {
  return Response.json({ Items: listIgnored() } satisfies IgnoredResponse);
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

export async function POST(req: Request) {
  const entry = await parseEntry(req);
  if (!entry) return Response.json({ error: "Expected { kind, seriesId, season } or { kind: \"collection\", collectionId, movieId }." }, { status: 400 });
  addIgnored(entry);
  return Response.json({ Items: listIgnored() } satisfies IgnoredResponse);
}

export async function DELETE(req: Request) {
  const entry = await parseEntry(req);
  if (!entry) return Response.json({ error: "Expected { kind, seriesId, season } or { kind: \"collection\", collectionId, movieId }." }, { status: 400 });
  removeIgnored(entry);
  return Response.json({ Items: listIgnored() } satisfies IgnoredResponse);
}
