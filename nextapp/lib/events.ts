// What happened in the background that an admin wants to hear about, shown
// as notes on whatever page is open (components/event-toasts.tsx): only
// what needs a hand, a download done (ready to organize) or failed, a move
// failed or not done, a sync failed. The last MAX_EVENTS, each with a rising id
// to ask for what came after. State lives on globalThis (see
// test/state.ts); a restart forgets them and counts from 1 again, under a
// new boot id, so a page open across it asks from the start.
export type EventTone = "success" | "warning" | "error" | "plain";
// mono: the description is a release name, shown in Mono.
export type AppEvent = { id: number; title: string; description?: string; mono?: boolean; tone: EventTone };

const MAX_EVENTS = 50;

const g = globalThis as unknown as { __jellylensEvents?: { boot: string; next: number; events: AppEvent[] } };
const state = () => (g.__jellylensEvents ??= { boot: crypto.randomUUID(), next: 1, events: [] });

// Which run of the server the ids are from.
export const eventsBoot = () => state().boot;

export function notify(
  title: string,
  { description, mono, tone = "plain" }: { description?: string; mono?: boolean; tone?: EventTone } = {},
) {
  const s = state();
  s.events = [...s.events, { id: s.next++, title, description, mono, tone }].slice(-MAX_EVENTS);
}

// What came after id; and the last id there is, to ask from next time.
export function eventsAfter(id: number): { last: number; events: AppEvent[] } {
  const s = state();
  return { last: s.next - 1, events: s.events.filter((e) => e.id > id) };
}
