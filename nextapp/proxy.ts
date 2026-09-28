import { NextResponse, type NextRequest } from "next/server";
import { AUTH_ENABLED } from "@/lib/env";
import { SESSION_COOKIE, readSession } from "@/lib/session";

// Missing and Settings, plus everything that syncs or ignores, are admin
// only; everyone else gets Movies, TV Shows and their own Requests.
const ADMIN_ONLY = ["/missing", "/settings", "/api/sync", "/api/recheck-missing", "/api/ignored"];
const PUBLIC = ["/login", "/api/auth"];

const under = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));

// Sign-in gate in front of every page and API route. Pages redirect (to
// /login, or away from admin pages); API routes answer 401/403 instead.
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!AUTH_ENABLED || under(pathname, PUBLIC)) return NextResponse.next();

  const api = pathname.startsWith("/api/");
  const user = readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    if (api) return Response.json({ error: "Not signed in." }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (!user.admin && under(pathname, ADMIN_ONLY)) {
    if (api) return Response.json({ error: "Only Jellyfin administrators can do that." }, { status: 403 });
    return NextResponse.redirect(new URL("/movies", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
