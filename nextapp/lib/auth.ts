import { cookies } from "next/headers";
import { AUTH_ENABLED } from "./env";
import { LOCAL_USER, SESSION_COOKIE, readSession, type SessionUser } from "./session";

// The signed-in user, for server components and route handlers. proxy.ts
// already turned away anyone without a session, so null only shows up on
// the sign-in page itself.
export async function currentUser(): Promise<SessionUser | null> {
  if (!AUTH_ENABLED) return LOCAL_USER;
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}
