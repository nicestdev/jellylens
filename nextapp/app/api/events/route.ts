import type { EventsResponse } from "@/lib/api-types";
import { eventsAfter } from "@/lib/events";

// GET /api/events?after=<id> — the background events since that id (none
// without it: just where to ask from); admin only (proxy.ts).
export async function GET(req: Request) {
  const after = Number(new URL(req.url).searchParams.get("after"));
  const { last, events } = eventsAfter(Number.isFinite(after) && after >= 0 ? after : Infinity);
  return Response.json({ last, events } satisfies EventsResponse);
}
