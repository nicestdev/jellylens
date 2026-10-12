"use client";

import { useEffect, useId, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A page's search, filters and sort. From md up they're on the page; below
// it they go into the panel the phone bar's search button folds down
// (`MobileBar`), where the page's place for them stays empty. Only the
// last one mounted is shown there: a title page over a list (app/@modal)
// has the panel to itself until it closes.

type Tools = { id: string; active: boolean };
type State = { slot: HTMLElement | null; actionsSlot: HTMLElement | null; tools: Tools[] };

const KEY = "__jellylensPageTools";
type Store = { state: State; listeners: Set<() => void> };
function store(): Store {
  const g = globalThis as typeof globalThis & { [KEY]?: Store };
  g[KEY] ??= { state: { slot: null, actionsSlot: null, tools: [] }, listeners: new Set() };
  return g[KEY];
}
function set(change: (s: State) => State) {
  const s = store();
  s.state = change(s.state);
  s.listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  const { listeners } = store();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const getState = () => store().state;
const serverState: State = { slot: null, actionsSlot: null, tools: [] };

// The phone panel's place for the tools (a callback ref).
export function setPageToolsSlot(slot: HTMLElement | null) {
  set((s) => ({ ...s, slot }));
}

// The phone bar's place for a page's ⋯, before its menu button.
export function setPageActionsSlot(actionsSlot: HTMLElement | null) {
  set((s) => ({ ...s, actionsSlot }));
}

// What the phone bar needs: whether there's a page's tools at all (else no
// search button) and whether they narrow the page (a dot on the button).
export function usePageTools(): { present: boolean; active: boolean } {
  const { tools } = useSyncExternalStore(subscribe, getState, () => serverState);
  const top = tools.at(-1);
  return { present: !!top, active: !!top?.active };
}

// As max-md in app/globals.css: a phone on its side too.
const PHONE = "(width < 48rem) or (height < 30rem)";
function subscribePhone(listener: () => void) {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const usePhone = () =>
  useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE).matches,
    () => false,
  );

// active: a search or filter narrows what the page shows.
export function PageTools({ active, children }: { active: boolean; children: ReactNode }) {
  const id = useId();
  const phone = usePhone();
  const { slot, tools } = useSyncExternalStore(subscribe, getState, () => serverState);

  useEffect(() => {
    set((s) => ({ ...s, tools: [...s.tools, { id, active: false }] }));
    return () => set((s) => ({ ...s, tools: s.tools.filter((t) => t.id !== id) }));
  }, [id]);
  useEffect(() => {
    set((s) => ({ ...s, tools: s.tools.map((t) => (t.id === id ? { id, active } : t)) }));
  }, [id, active]);

  if (!phone) return children;
  if (!slot || tools.at(-1)?.id !== id) return null;
  return createPortal(children, slot);
}

// A page's ⋯ beside its heading (the Queue's): below md the heading is in
// the phone bar, so the ⋯ goes there too.
export function PageActions({ children }: { children: ReactNode }) {
  const phone = usePhone();
  const { actionsSlot } = useSyncExternalStore(subscribe, getState, () => serverState);
  if (!phone) return children;
  return actionsSlot ? createPortal(children, actionsSlot) : null;
}
