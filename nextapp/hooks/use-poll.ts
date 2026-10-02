"use client";

import { useEffect, useRef } from "react";

// Calls refresh every delayMs (null = not now), one call at a time: the
// next waits for the last to finish. While the tab is hidden it skips the
// calls, and it refreshes right away when the tab shows again. A new delay
// counts from when it's set (fast once a sync starts, not after the slow
// wait already under way).
export function usePoll(refresh: () => unknown, delayMs: number | null) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    if (delayMs === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const schedule = () => {
      if (!stopped) timer = setTimeout(tick, delayMs);
    };
    const tick = async () => {
      if (document.visibilityState !== "hidden") await Promise.resolve(latest.current()).catch(() => {});
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      tick();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [delayMs]);
}
