import { describe, expect, it, vi } from "vitest";
import * as limit from "./rate-limit";

const request = (headers: Record<string, string>) => new Request("http://jellylens.test/api/auth/login", { headers });

describe("clientIp", () => {
  it("prefers Cloudflare's header, then the last forwarded hop", () => {
    expect(limit.clientIp(request({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(limit.clientIp(request({ "x-forwarded-for": "9.9.9.9, 3.3.3.3" }))).toBe("3.3.3.3");
    expect(limit.clientIp(request({ "x-real-ip": "4.4.4.4" }))).toBe("4.4.4.4");
    expect(limit.clientIp(request({}))).toBe("unknown");
  });
});

describe("failed sign-ins", () => {
  it("refuses a key after five failures, until the window runs out", () => {
    vi.useFakeTimers();
    try {
      const keys = limit.loginKeys("1.1.1.1", "Bob");
      for (let i = 0; i < 4; i++) limit.recordFailure([keys.ip, keys.user]);
      expect(limit.retryAfter([keys.ip, keys.user])).toBe(0);
      limit.recordFailure([keys.ip, keys.user]);
      expect(limit.retryAfter([keys.ip, keys.user])).toBe(15 * 60);

      vi.advanceTimersByTime(15 * 60 * 1000);
      expect(limit.retryAfter([keys.ip, keys.user])).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts usernames case-insensitively, and clears one on success", () => {
    const a = limit.loginKeys("1.1.1.1", "Bob");
    const b = limit.loginKeys("2.2.2.2", "bob");
    expect(a.user).toBe(b.user);
    for (let i = 0; i < 5; i++) limit.recordFailure([a.user]);
    expect(limit.retryAfter([b.user])).toBeGreaterThan(0);
    limit.clearFailures(a.user);
    expect(limit.retryAfter([b.user])).toBe(0);
  });
});
