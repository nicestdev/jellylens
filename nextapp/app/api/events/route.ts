import type { EventsResponse } from "@/lib/api-types";
import { eventsAfter, eventsBoot } from "@/lib/events";

// GET /api/events?after=<id>&boot=<id> — the background events since that
// id (none without it: just where to ask from); every one there is if boot
// is another run's (the server restarted, its ids started over). Admin
// only (proxy.ts).
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const boot = eventsBoot();
  const after = params.has("after") ? Number(params.get("after")) : NaN;
  const from = params.has("boot") && params.get("boot") !== boot ? 0 : after;
  const { last, events } = eventsAfter(Number.isFinite(from) && from >= 0 ? from : Infinity);
  return Response.json({ boot, last, events } satisfies EventsResponse);
}
