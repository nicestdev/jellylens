"use client";

import { useEffect, useRef } from "react";

// Runs onEvent for each of the app's events of this name on window (a
// CustomEvent's detail along), always the latest onEvent, so callers can
// pass an inline function without re-subscribing.
export function useWindowEvent<T = unknown>(name: string, onEvent: (detail: T) => void) {
  const latest = useRef(onEvent);
  useEffect(() => {
    latest.current = onEvent;
  });
  useEffect(() => {
    const handler = (e: Event) => latest.current((e as CustomEvent<T>).detail);
    window.addEventListener(name, handler);
    return () => window.removeEventListener(name, handler);
  }, [name]);
}
