import { describe, expect, it, vi } from "vitest";
import { version } from "../package.json";
import { log, logStart, took } from "./log";
import { addLog, listLogs } from "./store";

describe("log", () => {
  it("writes each line to the console and the database, with its details", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    log.warn("xrel", "Hourly limit reached", { calls: 3, remaining: 8, resetAt: "2026-10-17T05:00:00.000Z" });
    log.error("downloads", "Heat failed", new Error("terminated"));
    log.info("wcx", "Added Heat", "· rapidgator (hide.cx)");
    expect(warn).toHaveBeenCalledWith(
      "[xrel] Hourly limit reached calls=3 remaining=8 resetAt=2026-10-17T05:00:00.000Z",
    );
    expect(listLogs().map((e) => [e.level, e.area, e.message])).toEqual([
      ["info", "wcx", "Added Heat · rapidgator (hide.cx)"],
      ["error", "downloads", "Heat failed: terminated"],
      ["warn", "xrel", "Hourly limit reached calls=3 remaining=8 resetAt=2026-10-17T05:00:00.000Z"],
    ]);
  });

  it("says at start whether it's the first, an update or the same version", () => {
    logStart();
    expect(listLogs()[0].message).toMatch(new RegExp(`^Started Jellylens ${version} \\(first start\\) · Node`));
    addLog("info", "app", "Started Jellylens 0.9.0");
    logStart();
    expect(listLogs()[0].message).toMatch(`(updated from 0.9.0)`);
    logStart();
    expect(listLogs()[0].message).toMatch(new RegExp(`^Started Jellylens ${version} · Node`));
  });

  it("says how long something took", () => {
    vi.useFakeTimers({ now: 200_000, toFake: ["Date"] });
    try {
      expect(took(195_800)).toBe("4.2 s");
      expect(took(8_000)).toBe("3 min 12 s");
    } finally {
      vi.useRealTimers();
    }
  });
});
