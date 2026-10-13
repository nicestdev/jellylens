"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

// The phone bar's place for a page's ⋯ (a callback ref), kept where the bar
// and the page can both reach it.
type Store = { slot: HTMLElement | null; listeners: Set<() => void> };
const KEY = "__jellylensPageTools";
function store(): Store {
  const g = globalThis as typeof globalThis & { [KEY]?: Store };
  g[KEY] ??= { slot: null, listeners: new Set() };
  return g[KEY];
}
export function setPageActionsSlot(slot: HTMLElement | null) {
  const s = store();
  s.slot = slot;
  s.listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  const { listeners } = store();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// As max-md in app/globals.css: a phone on its side too.
const PHONE = "(width < 48rem) or (height < 30rem)";
function subscribePhone(listener: () => void) {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
export const isPhone = () => typeof window !== "undefined" && !!window.matchMedia?.(PHONE).matches;
const usePhone = () =>
  useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE).matches,
    () => false,
  );

// A page's ⋯ beside its heading (the Queue's): below md the heading is in
// the phone bar, so the ⋯ goes there too.
export function PageActions({ children }: { children: ReactNode }) {
  const phone = usePhone();
  const slot = useSyncExternalStore(
    subscribe,
    () => store().slot,
    () => null,
  );
  if (!phone) return children;
  return slot ? createPortal(children, slot) : null;
}
