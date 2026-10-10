import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { json, mockFetch } from "@/test/http";
import { setDownloadSettings } from "@/lib/store";

// GET /api/config: the Settings page's view of the env, secrets masked.
// The env is read on import, so the mock reads each value from `env` as
// it's used, and a test sets what it needs.
const env = vi.hoisted(() => ({
  JELLYFIN_API_KEY: "",
  TMDB_API_KEY: "",
  DDOWNLOAD_LOGIN: "",
  DDOWNLOAD_PASSWORD: "",
  REALDEBRID_TOKEN: "",
  ARCHIVE_PASSWORDS: [] as string[],
}));
vi.mock("@/lib/env", async (original) => {
  const real = await original<typeof import("@/lib/env")>();
  const mocked = { ...real, AUTH_ENABLED: true };
  for (const key of Object.keys(env) as (keyof typeof env)[]) {
    Object.defineProperty(mocked, key, { get: () => env[key], enumerable: true });
  }
  return mocked;
});

beforeEach(() => {
  Object.assign(env, {
    JELLYFIN_API_KEY: "",
    TMDB_API_KEY: "",
    DDOWNLOAD_LOGIN: "",
    DDOWNLOAD_PASSWORD: "",
    REALDEBRID_TOKEN: "",
    ARCHIVE_PASSWORDS: [],
  });
});

const config = async () => (await (await import("./config/route")).GET()).json();

describe("GET /api/config", () => {
  it("shows a long key's first and last four characters only", async () => {
    env.JELLYFIN_API_KEY = "abcd1234567890wxyz";
    env.TMDB_API_KEY = "123456789";
    env.REALDEBRID_TOKEN = "RDTOKEN0000000000END1";
    const body = await config();
    expect(body.jellyfinApiKey).toBe("abcd********wxyz");
    expect(body.tmdbApiKey).toBe("1234********6789");
    expect(body.realDebridToken).toBe("RDTO********END1");
  });

  it("masks a key of eight characters or fewer completely", async () => {
    env.JELLYFIN_API_KEY = "12345678";
    env.TMDB_API_KEY = "abc";
    env.REALDEBRID_TOKEN = "x";
    const body = await config();
    expect(body.jellyfinApiKey).toBe("********");
    expect(body.tmdbApiKey).toBe("***");
    expect(body.realDebridToken).toBe("*");
  });

  it("leaves an unset key empty", async () => {
    const body = await config();
    expect(body).toMatchObject({ jellyfinApiKey: "", tmdbApiKey: "", realDebridToken: "", ddownloadPassword: "" });
  });

  it("never shows the ddownload password, nor its length", async () => {
    env.DDOWNLOAD_LOGIN = "anna";
    for (const password of ["Qz9", "Qz9-a-much-longer-password-than-eight"]) {
      env.DDOWNLOAD_PASSWORD = password;
      const body = await config();
      expect(body.ddownloadLogin).toBe("anna");
      expect(body.ddownloadPassword).toBe("********");
      expect(JSON.stringify(body)).not.toContain("Qz9");
    }
  });

  it("counts ARCHIVE_PASSWORDS without listing them, but lists the Settings ones", async () => {
    env.ARCHIVE_PASSWORDS = ["env-one", "env-two"];
    setDownloadSettings({ slots: 4, passwords: ["example.com"] });
    const body = await config();
    expect(body).toMatchObject({
      archivePasswords: 2,
      downloadSlots: 4,
      maxDownloadSlots: 10,
      passwords: ["example.com"],
    });
    expect(JSON.stringify(body)).not.toContain("env-one");
    expect(body.intervals).toEqual({ library: 6, tmdb: 24, missing: 24, releases: 6 });
  });

  it("is kept from users who aren't admins (proxy.ts)", async () => {
    mockFetch((url) =>
      url.pathname === "/Users"
        ? json([
            { Id: "admin", Name: "Anna", Policy: { IsAdministrator: true } },
            { Id: "user", Name: "Ben", Policy: { IsAdministrator: false } },
          ])
        : undefined,
    );
    const { proxy } = await import("@/proxy");
    const { createSession, SESSION_COOKIE } = await import("@/lib/session");
    const call = (path: string, admin: boolean) =>
      proxy(
        new NextRequest("http://jellylens.test" + path, {
          headers: {
            cookie: `${SESSION_COOKIE}=${createSession({ id: admin ? "admin" : "user", name: "X", admin })}`,
          },
        }),
      );
    for (const path of ["/api/config", "/api/downloads", "/api/organize", "/api/events"]) {
      expect((await call(path, false)).status, path).toBe(403);
      expect((await call(path, true)).headers.get("x-middleware-next"), path).toBe("1");
    }
    expect((await proxy(new NextRequest("http://jellylens.test/api/config"))).status).toBe(401);
  });
});
