import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { json, mockFetch } from "@/test/http";

// proxy.ts reads AUTH_ENABLED on import, so each test loads it fresh.
async function load(authEnabled = "true") {
  vi.stubEnv("AUTH_ENABLED", authEnabled);
  vi.resetModules();
  const { proxy } = await import("./proxy");
  const { createSession, SESSION_COOKIE } = await import("./lib/session");
  return { proxy, cookie: (admin: boolean) => `${SESSION_COOKIE}=${createSession({ id: admin ? "admin" : "user", name: "X", admin })}` };
}

beforeEach(() => {
  mockFetch((url) =>
    url.pathname === "/Users"
      ? json([
          { Id: "admin", Name: "Admin", Policy: { IsAdministrator: true } },
          { Id: "user", Name: "User", Policy: { IsAdministrator: false } },
        ])
      : undefined
  );
});

const request = (path: string, init: { method?: string; cookie?: string; site?: string } = {}) =>
  new NextRequest("http://jellylens.test" + path, {
    method: init.method ?? "GET",
    headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.site ? { "sec-fetch-site": init.site } : {}) },
  });

// NextResponse.next() carries this header; a redirect or error doesn't.
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy", () => {
  it("sends visitors without a session to sign in, keeping where they were going", async () => {
    const { proxy } = await load();
    const page = await proxy(request("/releases?q=heat"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://jellylens.test/login?next=%2Freleases%3Fq%3Dheat");
    const api = await proxy(request("/api/movies"));
    expect(api.status).toBe(401);
  });

  it("lets anyone reach the sign-in page and its API", async () => {
    const { proxy } = await load();
    expect(passes(await proxy(request("/login")))).toBe(true);
    expect(passes(await proxy(request("/api/auth/login", { method: "POST" })))).toBe(true);
  });

  it("keeps admin pages and APIs to admins", async () => {
    const { proxy, cookie } = await load();
    for (const path of ["/missing", "/releases", "/analytics", "/upgrades", "/settings"]) {
      const res = await proxy(request(path, { cookie: cookie(false) }));
      expect(res.headers.get("location"), path).toBe("http://jellylens.test/movies");
      expect(passes(await proxy(request(path, { cookie: cookie(true) }))), path).toBe(true);
    }
    for (const path of ["/api/releases", "/api/releases/abc", "/api/release-groups", "/api/analytics", "/api/upgrades", "/api/sync/tmdb", "/api/preferences", "/api/config"]) {
      expect((await proxy(request(path, { cookie: cookie(false) }))).status, path).toBe(403);
    }
  });

  it("gives everyone signed in the shared pages", async () => {
    const { proxy, cookie } = await load();
    for (const path of ["/movies", "/shows", "/requests", "/api/requests", "/api/tmdb-image/w342/a.jpg"]) {
      expect(passes(await proxy(request(path, { cookie: cookie(false) }))), path).toBe(true);
    }
  });

  it("blocks state changes from other sites, even when signed in", async () => {
    const { proxy, cookie } = await load();
    const res = await proxy(request("/api/requests", { method: "POST", cookie: cookie(true), site: "cross-site" }));
    expect(res.status).toBe(403);
    expect((await proxy(request("/api/requests", { method: "POST", cookie: cookie(true), site: "same-site" }))).status).toBe(403);
    expect(passes(await proxy(request("/api/requests", { method: "POST", cookie: cookie(true), site: "same-origin" })))).toBe(true);
    // Reading is fine from anywhere (it's still gated by the session).
    expect(passes(await proxy(request("/api/requests", { cookie: cookie(true), site: "cross-site" })))).toBe(true);
  });

  it("with sign-in off, lets everything through", async () => {
    const { proxy } = await load("false");
    expect(passes(await proxy(request("/settings")))).toBe(true);
    expect(passes(await proxy(request("/api/release-groups", { method: "POST" })))).toBe(true);
  });
});
