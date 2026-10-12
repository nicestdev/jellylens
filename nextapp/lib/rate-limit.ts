// Failed sign-ins, counted per client IP and per username. After
// MAX_FAILURES within the window, that IP or username is refused until the
// window runs out — before Jellyfin is even asked, so guessing can't run up
// Jellyfin's own lockout counter much either. In memory: a restart resets it.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type Counter = { failures: number; resetAt: number };
const globalForLimits = globalThis as unknown as { __loginFailures?: Map<string, Counter> };
// Looked up on every call, never captured: tests start over by dropping it.
const counters = () => (globalForLimits.__loginFailures ??= new Map());

// The visitor's address. Behind Cloudflare it's CF-Connecting-IP, which
// Cloudflare always overwrites; behind another reverse proxy, the last
// X-Forwarded-For hop (the one the proxy itself added). Reached directly,
// these headers could be forged — the per-username limit still holds then.
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function loginKeys(ip: string, username: string): { ip: string; user: string } {
  return { ip: "ip:" + ip, user: "user:" + username.toLowerCase() };
}

// Seconds until another attempt is allowed for any of the keys; 0 = now.
export function retryAfter(keys: string[]): number {
  const now = Date.now();
  let wait = 0;
  for (const key of keys) {
    const c = counters().get(key);
    if (c && c.resetAt > now && c.failures >= MAX_FAILURES) wait = Math.max(wait, c.resetAt - now);
  }
  return Math.ceil(wait / 1000);
}

export function recordFailure(keys: string[]) {
  const now = Date.now();
  if (counters().size > 1000) for (const [key, c] of counters()) if (c.resetAt <= now) counters().delete(key);
  for (const key of keys) {
    const c = counters().get(key);
    if (!c || c.resetAt <= now) counters().set(key, { failures: 1, resetAt: now + WINDOW_MS });
    else c.failures++;
  }
}

export function clearFailures(key: string) {
  counters().delete(key);
}
