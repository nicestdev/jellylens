"use client";

import { useEffect, useRef } from "react";
import { COUNTS_STALE, apiFetch } from "@/lib/api-client";
import type { EventsResponse } from "@/lib/api-types";
import { toast } from "@/lib/toast";
import { usePoll } from "@/hooks/use-poll";

const POLL_MS = 5000;

// Background events (lib/events.ts) as notes on whatever page is open, for
// admins: asks every POLL_MS for what came after the last one it saw;
// what happened before the page opened isn't shown (where to start from is
// asked for again on the next poll if the first ask failed). Any of them
// may change the sidebar's counts, so it's told to ask again.
export function EventToasts() {
  const seen = useRef<{ boot: string; last: number } | null>(null);
  const start = () =>
    apiFetch<EventsResponse>("/api/events").then((r) => {
      seen.current ??= { boot: r.boot, last: r.last };
    });
  useEffect(() => {
    start().catch(() => {});
  }, []);
  usePoll(async () => {
    if (!seen.current) return start();
    const { boot, last } = seen.current;
    const r = await apiFetch<EventsResponse>(`/api/events?after=${last}&boot=${encodeURIComponent(boot)}`);
    seen.current = { boot: r.boot, last: r.last };
    for (const e of r.events) toast(e.title, { description: e.description, mono: e.mono, tone: e.tone });
    if (r.events.length) window.dispatchEvent(new Event(COUNTS_STALE));
  }, POLL_MS);
  return null;
}
