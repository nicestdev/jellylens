"use client";

import { useEffect, useEffectEvent } from "react";

// Calls refresh every delayMs (null = not now), one call at a time: the
// next waits for the last to finish. While the tab is hidden it skips the
// calls, and it refreshes right away when the tab shows again. A new delay
// counts from when it's set (fast once a sync starts, not after the slow
// wait already under way).
export function usePoll(refresh: () => unknown, delayMs: number | null) {
  // Always the latest refresh, without starting the timers over.
  const call = useEffectEvent(() => refresh());

  useEffect(() => {
    if (delayMs === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // A call under way: the tab showing again meanwhile doesn't start a
    // second one (and a second chain of timers with it).
    let busy = false;
    const schedule = () => {
      if (!stopped) timer = setTimeout(tick, delayMs);
    };
    const tick = async () => {
      busy = true;
      if (document.visibilityState !== "hidden") await Promise.resolve(call()).catch(() => {});
      busy = false;
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible" || busy) return;
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
