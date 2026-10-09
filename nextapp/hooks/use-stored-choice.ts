"use client";

import { useCallback, useSyncExternalStore } from "react";

// A choice remembered in this browser only (localStorage), like a page's
// library tab. The server render uses the fallback, the browser the stored
// value right away. Where storage is blocked (private windows) the choice
// still holds for the visit, in memory. Every component on the same key
// follows along, also in other tabs. A null fallback means "nothing picked
// yet", for pages that choose their own start until you pick.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): string | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {}
  return memory.get(key) ?? null;
}

export function useStoredChoice<T extends string, F extends T | null = T>(
  key: string,
  options: readonly T[],
  fallback: F,
): [T | F, (value: T) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = options.includes(stored as T) ? (stored as T) : fallback;
  const set = useCallback(
    (next: T) => {
      memory.set(key, next);
      try {
        localStorage.setItem(key, next);
      } catch {}
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
