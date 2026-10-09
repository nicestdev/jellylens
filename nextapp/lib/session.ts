import crypto from "crypto";
import fs from "fs";
import path from "path";
import { DATA_DIR, JELLYFIN_API_KEY, JELLYFIN_URL } from "./env";
import { jfGet, type JellyfinUser } from "./jellyfin";

// Who's signed in. The Jellyfin password is checked once at sign-in (see
// app/api/auth/login); after that Jellylens keeps its own signed cookie and
// checks it against Jellyfin's user list on every request (activeUser).
export type SessionUser = { id: string; name: string; admin: boolean };

// Everyone, when sign-in is off (AUTH_ENABLED=false).
export const LOCAL_USER: SessionUser = { id: "local", name: "Local", admin: true };

export const SESSION_COOKIE = "jellylens_session";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // seconds

type Payload = SessionUser & { exp: number };

// Generated on first use and kept in DATA_DIR, so sessions survive restarts
// without another env var. Deleting the file signs everyone out. "wx" makes
// the first writer win if two requests race to create it.
let secret: Buffer | null = null;
function sessionSecret(): Buffer {
  if (secret) return secret;
  const file = path.join(DATA_DIR, "session-secret");
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  secret = Buffer.from(fs.readFileSync(file, "utf8").trim());
  return secret;
}

const sign = (data: string) => crypto.createHmac("sha256", sessionSecret()).update(data).digest("base64url");

// "<payload>.<signature>", both base64url.
export function createSession(user: SessionUser): string {
  const payload: Payload = {
    id: user.id,
    name: user.name,
    admin: user.admin,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return data + "." + sign(data);
}

export function readSession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const p: Payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (typeof p.exp !== "number" || p.exp * 1000 < Date.now()) return null;
    return { id: p.id, name: p.name, admin: p.admin === true };
  } catch {
    return null;
  }
}

type Account = { name: string; admin: boolean; disabled: boolean };
const ACCOUNTS_TTL_MS = 60 * 1000;
// Stashed on globalThis so proxy.ts and the route handlers share one copy.
const globalForAccounts = globalThis as unknown as {
  __jellyfinAccounts?: { at: number; byId: Map<string, Account> | null; pending?: Promise<void> };
};
const accountsState = () => (globalForAccounts.__jellyfinAccounts ??= { at: 0, byId: null });

// Jellyfin's users by id, fetched with the API key at most once a minute.
// null = never fetched successfully; a failed refresh keeps the last list.
async function jellyfinAccounts(): Promise<Map<string, Account> | null> {
  const accounts = accountsState();
  if (Date.now() - accounts.at > ACCOUNTS_TTL_MS) {
    accounts.pending ??= jfGet<JellyfinUser[]>(JELLYFIN_URL, JELLYFIN_API_KEY, "/Users")
      .then((users) => {
        accounts.byId = new Map(
          users.map((u) => [
            u.Id,
            { name: u.Name, admin: u.Policy?.IsAdministrator === true, disabled: u.Policy?.IsDisabled === true },
          ]),
        );
      })
      .catch((e) => console.error("[auth] couldn't refresh Jellyfin users:", (e as Error).message))
      .finally(() => {
        accounts.at = Date.now();
        accounts.pending = undefined;
      });
    await accounts.pending;
  }
  return accounts.byId;
}

// The session's user as Jellyfin has them right now: signed out once
// deleted or disabled there, with current admin rights and name. Only if
// Jellyfin's user list has never been reachable does the cookie alone count.
export async function activeUser(token: string | undefined): Promise<SessionUser | null> {
  const user = readSession(token);
  if (!user) return null;
  const byId = await jellyfinAccounts();
  if (!byId) return user;
  const account = byId.get(user.id);
  if (!account || account.disabled) return null;
  return { id: user.id, name: account.name, admin: account.admin };
}

// Where to go after signing in: only a path on this site, never "//host".
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
