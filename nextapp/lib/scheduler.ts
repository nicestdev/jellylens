// A sync stage's run, shared by every caller: overlapping calls (a manual
// "Sync now" racing a scheduled tick) join the one in flight instead of
// starting another. It logs start, end and failure, and remembers whether a
// run is going and how the last one failed (cleared by the next success),
// for the Settings page.
export type Trigger<T> = {
  (): Promise<T>;
  running: () => boolean;
  lastError: () => string | null;
};

export function makeTrigger<T>(name: string, fn: () => Promise<T>): Trigger<T> {
  let inFlight: Promise<T> | null = null;
  let lastError: string | null = null;
  const trigger = () => {
    if (!inFlight) {
      console.log("[" + name + "] started");
      inFlight = fn()
        .then((result) => {
          console.log("[" + name + "] done", result);
          lastError = null;
          return result;
        })
        .catch((e) => {
          console.error("[" + name + "] failed:", (e as Error).message);
          lastError = (e as Error).message;
          throw e;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  };
  return Object.assign(trigger, { running: () => inFlight !== null, lastError: () => lastError });
}

// Starts a run without waiting for it, for routes that answer right away
// (a long sync would outlast a reverse proxy's timeout, e.g. Cloudflare's
// 100 s). Its failure is logged and kept by the trigger.
export function start(trigger: () => Promise<unknown>) {
  trigger().catch(() => {});
}

// One interval per key, so calling this again replaces the timer instead of
// stacking a second one (`next dev` can run the boot hook again after a
// reload; the map lives on globalThis to survive that). hours 0 = off.
// A failed run is already logged by makeTrigger and must not surface as an
// unhandled rejection, which would take the server down.
type TimerMap = Record<string, ReturnType<typeof setInterval> | undefined>;
const globalForTimers = globalThis as unknown as { __jellylensTimers?: TimerMap };
const timers: TimerMap = (globalForTimers.__jellylensTimers ??= {});

export function setSchedule(key: string, hours: number, run: () => Promise<unknown>) {
  clearInterval(timers[key]);
  timers[key] = hours > 0 ? setInterval(() => run().catch(() => {}), hours * 60 * 60 * 1000) : undefined;
}
