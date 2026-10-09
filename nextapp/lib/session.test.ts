import { describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import { resetServerState } from "@/test/state";
import * as session from "./session";

const bob = { id: "u1", name: "Bob", admin: true };
const jellyfinUsers = (
  users: { Id: string; Name: string; Policy?: { IsAdministrator?: boolean; IsDisabled?: boolean } }[],
) => mockFetch((url) => (url.pathname === "/Users" ? json(users) : undefined));

describe("session cookies", () => {
  it("round-trips a user", () => {
    expect(session.readSession(session.createSession(bob))).toEqual(bob);
  });

  it("rejects a tampered, malformed or missing cookie", () => {
    const [data, signature] = session.createSession(bob).split(".");
    const forged = Buffer.from(JSON.stringify({ ...bob, id: "u2", exp: 9999999999 })).toString("base64url");
    expect(session.readSession(forged + "." + signature)).toBeNull();
    expect(session.readSession(data + ".x")).toBeNull();
    expect(session.readSession(data)).toBeNull();
    expect(session.readSession(undefined)).toBeNull();
  });

  it("expires after a week", () => {
    vi.useFakeTimers();
    try {
      const token = session.createSession(bob);
      vi.advanceTimersByTime(session.SESSION_MAX_AGE * 1000 - 1000);
      expect(session.readSession(token)).toEqual(bob);
      vi.advanceTimersByTime(2000);
      expect(session.readSession(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("activeUser", () => {
  it("follows Jellyfin: current name and admin rights", async () => {
    jellyfinUsers([{ Id: "u1", Name: "Daniel", Policy: { IsAdministrator: false } }]);
    expect(await session.activeUser(session.createSession(bob))).toEqual({ id: "u1", name: "Daniel", admin: false });
  });

  it("signs out users deleted or disabled in Jellyfin", async () => {
    jellyfinUsers([{ Id: "u2", Name: "Ana" }]);
    expect(await session.activeUser(session.createSession(bob))).toBeNull();

    resetServerState();
    jellyfinUsers([{ Id: "u1", Name: "Bob", Policy: { IsDisabled: true } }]);
    expect(await session.activeUser(session.createSession(bob))).toBeNull();
  });

  it("asks Jellyfin at most once a minute", async () => {
    const fetch = jellyfinUsers([{ Id: "u1", Name: "Bob", Policy: { IsAdministrator: true } }]);
    const token = session.createSession(bob);
    await Promise.all([session.activeUser(token), session.activeUser(token)]);
    await session.activeUser(token);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("trusts the cookie alone only while Jellyfin's list has never been reachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(() => new Response("", { status: 502 }));
    expect(await session.activeUser(session.createSession(bob))).toEqual(bob);
  });
});

describe("safeNext", () => {
  it("only allows paths on this site", () => {
    expect(session.safeNext("/releases?q=x")).toBe("/releases?q=x");
    expect(session.safeNext("//evil.example")).toBe("/");
    expect(session.safeNext("/\\evil.example")).toBe("/");
    expect(session.safeNext("https://evil.example")).toBe("/");
    expect(session.safeNext(null)).toBe("/");
  });
});
