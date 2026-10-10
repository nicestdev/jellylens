// What happened in the background that an admin wants to hear about, shown
// as notes on whatever page is open (components/event-toasts.tsx): a
// download done or failed, a move or Undo done or failed, a sync failed,
// a sync started by hand done. The last MAX_EVENTS, each with a rising id
// to ask for what came after. State lives on globalThis (see
// test/state.ts); a restart forgets them.
export type EventTone = "success" | "error" | "plain";
export type AppEvent = { id: number; title: string; description?: string; tone: EventTone };

const MAX_EVENTS = 50;

const g = globalThis as unknown as { __jellylensEvents?: { next: number; events: AppEvent[] } };
const state = () => (g.__jellylensEvents ??= { next: 1, events: [] });

export function notify(
  title: string,
  { description, tone = "plain" }: { description?: string; tone?: EventTone } = {},
) {
  const s = state();
  s.events = [...s.events, { id: s.next++, title, description, tone }].slice(-MAX_EVENTS);
}

// What came after id; and the last id there is, to ask from next time.
export function eventsAfter(id: number): { last: number; events: AppEvent[] } {
  const s = state();
  return { last: s.next - 1, events: s.events.filter((e) => e.id > id) };
}
