import { NextResponse, type NextRequest } from "next/server";
import { AUTH_ENABLED } from "@/lib/env";
import { DEV_NON_ADMIN_COOKIE } from "@/lib/dev-cookie";
import { LOCAL_USER, SESSION_COOKIE, activeUser } from "@/lib/session";

// The Dashboard, the Queue, Analytics and Settings, plus a release's page and
// everything that syncs or ignores, are admin only; everyone else gets Movies, Shows, Discover and their own Wishlist.
const ADMIN_ONLY = [
  "/dashboard",
  "/queue",
  "/api/downloads",
  "/api/organize",
  "/api/events",
  "/settings",
  "/api/config",
  "/api/sync",
  "/api/ignored",
  "/api/preferences",
  "/api/releases",
  "/api/release-groups",
  "/analytics",
  "/api/analytics",
  "/title",
  "/api/wcx-search",
  "/api/wcx-releases",
  "/api/xrel-link",
];
const PUBLIC = ["/login", "/api/auth"];
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

const under = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));

// Sign-in gate in front of every page and API route. Pages redirect (to
// /login, or away from admin pages); API routes answer 401/403 instead.
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Anything that changes state must come from Jellylens' own pages. The
  // SameSite cookie already keeps other sites out; this also covers sibling
  // subdomains. Browsers always send Sec-Fetch-Site; scripts like curl don't,
  // and get through (they have no one's cookie to abuse).
  const site = req.headers.get("sec-fetch-site");
  if (!SAFE_METHODS.includes(req.method) && (site === "cross-site" || site === "same-site")) {
    return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
  }

  // In `next dev` the Dev section can show the app as a non-admin, sign-in off too.
  const nonAdmin = process.env.NODE_ENV === "development" && req.cookies.get(DEV_NON_ADMIN_COOKIE)?.value === "1";
  if ((!AUTH_ENABLED && !nonAdmin) || under(pathname, PUBLIC)) return NextResponse.next();

  const api = pathname.startsWith("/api/");
  const found = AUTH_ENABLED ? await activeUser(req.cookies.get(SESSION_COOKIE)?.value) : LOCAL_USER;
  const user = found && nonAdmin ? { ...found, admin: false } : found;
  if (!user) {
    if (api) return Response.json({ error: "Not signed in." }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  // The release list itself (Discover) is for everyone; its titles' pages aren't.
  if (!user.admin && under(pathname, ADMIN_ONLY) && pathname !== "/api/releases") {
    if (api) return Response.json({ error: "Only Jellyfin administrators can do that." }, { status: 403 });
    return NextResponse.redirect(new URL("/movies", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest).*)"],
};
