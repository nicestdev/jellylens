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
  const { showId } = body;
  if (typeof showId !== "string" || !showId) return null;
  return { showId };
}

export async function POST(req: Request) {
  const entry = await parseEntry(req);
  if (!entry) return Response.json({ error: "Expected { showId }." }, { status: 400 });
  addIgnored(entry);
  return Response.json({ items: listIgnored() } satisfies IgnoredResponse);
}

export async function DELETE(req: Request) {
  const entry = await parseEntry(req);
  if (!entry) return Response.json({ error: "Expected { showId }." }, { status: 400 });
  removeIgnored(entry);
  return Response.json({ items: listIgnored() } satisfies IgnoredResponse);
}
