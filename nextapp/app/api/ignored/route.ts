import type { IgnoredResponse } from "@/lib/api-types";
import { addIgnored, listIgnored, removeIgnored, type IgnoreEntry } from "@/lib/store";

export async function GET() {
  return Response.json({ items: listIgnored() } satisfies IgnoredResponse);
}

async function parseEntry(req: Request): Promise<IgnoreEntry | null> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  const { showId, season } = body;
  if (typeof showId !== "string" || !showId) return null;
  if (season !== null && !Number.isInteger(season)) return null;
  return { showId, season: season as number | null };
}

export async function POST(req: Request) {
  const entry = await parseEntry(req);
  if (!entry) return Response.json({ error: "Expected { showId, season }." }, { status: 400 });
  addIgnored(entry);
  return Response.json({ items: listIgnored() } satisfies IgnoredResponse);
}

export async function DELETE(req: Request) {
  const entry = await parseEntry(req);
  if (!entry) return Response.json({ error: "Expected { showId, season }." }, { status: 400 });
  removeIgnored(entry);
  return Response.json({ items: listIgnored() } satisfies IgnoredResponse);
}
