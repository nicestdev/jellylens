import { cookies } from "next/headers";
import { AUTH_ENABLED } from "./env";
import { DEV_NON_ADMIN_COOKIE } from "./dev-cookie";
import { LOCAL_USER, SESSION_COOKIE, activeUser, type SessionUser } from "./session";

// The signed-in user, for server components and route handlers. proxy.ts
// already turned away anyone without a session, so null only shows up on
// the sign-in page itself.
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const user = AUTH_ENABLED ? await activeUser(jar.get(SESSION_COOKIE)?.value) : LOCAL_USER;
  const nonAdmin = process.env.NODE_ENV === "development" && jar.get(DEV_NON_ADMIN_COOKIE)?.value === "1";
  return user && nonAdmin ? { ...user, admin: false } : user;
}
