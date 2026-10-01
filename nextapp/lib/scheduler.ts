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

// The state lives on globalThis, by name: instrumentation.ts (the boot
// sync) and the route handlers get their own copies of this module, and a
// run one of them started must count for the other.
type TriggerState = { inFlight: Promise<unknown> | null; lastError: string | null };
const globalForTriggers = globalThis as unknown as { __jellylensTriggers?: Record<string, TriggerState> };

export function makeTrigger<T>(name: string, fn: () => Promise<T>): Trigger<T> {
  const state = () => ((globalForTriggers.__jellylensTriggers ??= {})[name] ??= { inFlight: null, lastError: null });
  const trigger = () => {
    const s = state();
    if (!s.inFlight) {
      console.log("[" + name + "] started");
      s.inFlight = fn()
        .then((result) => {
          console.log("[" + name + "] done", result);
          s.lastError = null;
          return result;
        })
        .catch((e) => {
          console.error("[" + name + "] failed:", (e as Error).message);
          s.lastError = (e as Error).message;
          throw e;
        })
        .finally(() => {
          s.inFlight = null;
        });
    }
    return s.inFlight as Promise<T>;
  };
  return Object.assign(trigger, { running: () => state().inFlight !== null, lastError: () => state().lastError });
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
