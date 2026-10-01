"use client";

import { useEffect, useRef } from "react";

// Calls refresh every delayMs (null = not now), one call at a time: the
// next waits for the last to finish. While the tab is hidden it skips the
// calls, and it refreshes right away when the tab shows again. The delay
// can change between calls (fast while a sync runs, slow otherwise).
export function usePoll(refresh: () => unknown, delayMs: number | null) {
  const latest = useRef({ refresh, delayMs });
  useEffect(() => {
    latest.current = { refresh, delayMs };
  });

  useEffect(() => {
    if (delayMs === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const schedule = () => {
      const delay = latest.current.delayMs;
      if (!stopped && delay !== null) timer = setTimeout(tick, delay);
    };
    const tick = async () => {
      if (document.visibilityState !== "hidden") await Promise.resolve(latest.current.refresh()).catch(() => {});
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
    // Restarted only when polling turns on or off; a changed delay applies
    // from the next call.
  }, [delayMs === null]); // eslint-disable-line react-hooks/exhaustive-deps
}
