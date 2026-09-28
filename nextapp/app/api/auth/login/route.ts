import { cookies } from "next/headers";
import { authenticateUser } from "@/lib/jellyfin";
import { AUTH_ENABLED, JELLYFIN_URL } from "@/lib/env";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSession } from "@/lib/session";

// Secure only over HTTPS (directly or behind a TLS-terminating reverse
// proxy): plain-HTTP LAN setups are common, and a Secure cookie would never
// be sent back there.
function isHttps(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return forwarded ? forwarded === "https" : new URL(req.url).protocol === "https:";
}

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

  let user;
  try {
    user = await authenticateUser(JELLYFIN_URL, username, password);
  } catch (e) {
    return Response.json({ error: "Couldn't reach Jellyfin: " + (e as Error).message }, { status: 502 });
  }
  if (!user) return Response.json({ error: "Wrong username or password." }, { status: 401 });

  (await cookies()).set(SESSION_COOKIE, createSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return Response.json({ ok: true });
}
