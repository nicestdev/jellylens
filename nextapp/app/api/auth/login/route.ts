import { cookies } from "next/headers";
import { authenticateUser } from "@/lib/jellyfin";
import { AUTH_ENABLED, JELLYFIN_URL } from "@/lib/env";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSession } from "@/lib/session";
import { clearFailures, clientIp, loginKeys, recordFailure, retryAfter } from "@/lib/rate-limit";

// Secure only over HTTPS (directly or behind a TLS-terminating reverse
// proxy like a Cloudflare tunnel): plain-HTTP LAN setups are common, and a
// Secure cookie would never be sent back there.
function isHttps(req: Request): boolean {
  if (req.headers.get("cf-visitor")?.includes('"https"')) return true;
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return forwarded ? forwarded === "https" : new URL(req.url).protocol === "https:";
}

// Makes each wrong guess cost the guesser a second.
const FAILURE_DELAY_MS = 1000;

// POST { username, password } — checked against Jellyfin; on success sets
// the session cookie. Jellyfin accounts may have an empty password.
export async function POST(req: Request) {
  if (!AUTH_ENABLED) return Response.json({ error: "Sign-in is turned off (AUTH_ENABLED=false)." }, { status: 404 });
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username) return Response.json({ error: "Enter your Jellyfin username." }, { status: 400 });
  if (username.length > 256 || password.length > 1024) {
    return Response.json({ error: "Wrong username or password." }, { status: 400 });
  }

  const ip = clientIp(req);
  const keys = loginKeys(ip, username);
  const wait = retryAfter([keys.ip, keys.user]);
  if (wait) {
    return Response.json(
      { error: `Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(wait) } }
    );
  }

  let user;
  try {
    user = await authenticateUser(JELLYFIN_URL, username, password);
  } catch (e) {
    console.error("[auth] sign-in failed, Jellyfin unreachable:", (e as Error).message);
    return Response.json({ error: "Couldn't reach Jellyfin. Try again later." }, { status: 502 });
  }
  if (!user) {
    recordFailure([keys.ip, keys.user]);
    console.warn(`[auth] failed sign-in for ${JSON.stringify(username)} from ${ip}`);
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    return Response.json({ error: "Wrong username or password." }, { status: 401 });
  }

  // Only the username's count: an IP's goes on counting, so signing in to
  // one's own account between guesses doesn't reset the limit.
  clearFailures(keys.user);
  console.log(`[auth] ${user.name} signed in from ${ip}`);
  (await cookies()).set(SESSION_COOKIE, createSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return Response.json({ ok: true });
}
