import type { IgnoredResponse } from "@/lib/api-types";
import { addIgnored, listIgnored, removeIgnored, type IgnoreEntry } from "@/lib/store";
import { log } from "@/lib/log";

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
  const { showId } = body;
  if (typeof showId !== "string" || !showId) return null;
  return { showId };
}

export async function POST(req: Request) {
  const entry = await parseEntry(req);
  if (!entry) return Response.json({ error: "Expected { showId }." }, { status: 400 });
  addIgnored(entry);
  log.info("tmdb", `Ignored show ${entry.showId}`);
  return Response.json({ items: listIgnored() } satisfies IgnoredResponse);
}

export async function DELETE(req: Request) {
  const entry = await parseEntry(req);
  if (!entry) return Response.json({ error: "Expected { showId }." }, { status: 400 });
  removeIgnored(entry);
  log.info("tmdb", `Unignored show ${entry.showId}`);
  return Response.json({ items: listIgnored() } satisfies IgnoredResponse);
}
