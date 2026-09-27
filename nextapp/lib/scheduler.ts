// Dedupes overlapping calls (manual trigger racing a scheduled interval tick)
// so they share one in-flight run instead of executing twice.
export function makeTrigger<T>(name: string, fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return function trigger() {
    if (!inFlight) {
      console.log("[" + name + "] started");
      inFlight = fn()
        .then((result) => {
          console.log("[" + name + "] done", result);
          return result;
        })
        .catch((e) => {
          console.error("[" + name + "] failed:", (e as Error).message);
          throw e;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  };
}

// Keyed so a setting change can tear down and replace a previous interval
// instead of stacking a second timer on top of it. Stashed on globalThis for
// the same reason as the store singleton — survive `next dev` module reloads.
type TimerMap = Record<string, ReturnType<typeof setInterval> | undefined>;
const globalForTimers = globalThis as unknown as { __mediaTimers?: TimerMap };
const timers: TimerMap = globalForTimers.__mediaTimers ?? {};
globalForTimers.__mediaTimers = timers;

export function setSchedule(key: string, hours: number, fn: () => void) {
  if (timers[key]) {
    clearInterval(timers[key]);
    timers[key] = undefined;
  }
  if (hours && hours > 0) {
    timers[key] = setInterval(fn, hours * 60 * 60 * 1000);
  }
}
