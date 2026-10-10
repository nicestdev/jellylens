"use client";

import { useEffect, useRef } from "react";
import { COUNTS_STALE, apiFetch } from "@/lib/api-client";
import type { EventsResponse } from "@/lib/api-types";
import { toast } from "@/lib/toast";
import { usePoll } from "@/hooks/use-poll";

const POLL_MS = 5000;

// Background events (lib/events.ts) as notes on whatever page is open, for
// admins: asks every POLL_MS for what came after the last one it saw;
// what happened before the page opened isn't shown. Any of them may change
// the sidebar's counts, so it's told to ask again.
export function EventToasts() {
  const last = useRef<number | null>(null);
  useEffect(() => {
    apiFetch<EventsResponse>("/api/events")
      .then((r) => (last.current = r.last))
      .catch(() => {});
  }, []);
  usePoll(async () => {
    if (last.current === null) return;
    const r = await apiFetch<EventsResponse>(`/api/events?after=${last.current}`);
    last.current = r.last;
    for (const e of r.events) toast(e.title, { description: e.description, tone: e.tone });
    if (r.events.length) window.dispatchEvent(new Event(COUNTS_STALE));
  }, POLL_MS);
  return null;
}
