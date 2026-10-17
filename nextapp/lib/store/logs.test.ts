import { afterEach, describe, expect, it, vi } from "vitest";
import { addLog, lastStartedVersion, listLogs, pruneLogs } from ".";

describe("logs", () => {
  afterEach(() => vi.useRealTimers());

  const fill = () => {
    addLog("info", "xrel", "Releases sync started");
    addLog("warn", "xrel", "Hourly limit reached on /p2p/releases.json");
    addLog("error", "downloads", "Package failed: Heat.1995 100%_done");
    addLog("info", "app", "Started Jellylens 1.5.0 (updated from 1.4.0)");
  };

  it("lists the newest first, by level, area and every word, any case", () => {
    fill();
    expect(listLogs().map((e) => e.id)).toEqual([4, 3, 2, 1]);
    expect(listLogs({ levels: ["warn", "error"] }).map((e) => e.id)).toEqual([3, 2]);
    expect(listLogs({ areas: ["xrel"] }).map((e) => e.id)).toEqual([2, 1]);
    expect(listLogs({ q: "HOURLY releases" }).map((e) => e.id)).toEqual([2]);
    expect(listLogs({ q: "downloads" }).map((e) => e.id)).toEqual([3]);
    // % and _ are plain characters, not wildcards.
    expect(listLogs({ q: "100%_" }).map((e) => e.id)).toEqual([3]);
    expect(listLogs({ q: "0%d" })).toEqual([]);
  });

  it("pages before an id, and hands out what came after one", () => {
    fill();
    expect(listLogs({ before: 3, limit: 1 }).map((e) => e.id)).toEqual([2]);
    expect(listLogs({ after: 2 }).map((e) => e.id)).toEqual([4, 3]);
  });

  it("drops what's older than 14 days", () => {
    vi.useFakeTimers({ now: new Date("2026-10-01T12:00:00Z"), toFake: ["Date"] });
    addLog("info", "app", "old");
    vi.setSystemTime(new Date("2026-10-15T13:00:00Z"));
    addLog("info", "app", "new");
    expect(pruneLogs()).toBe(1);
    expect(listLogs().map((e) => e.message)).toEqual(["new"]);
  });

  it("knows the version the last start logged", () => {
    expect(lastStartedVersion()).toBeNull();
    fill();
    addLog("info", "app", "Started Jellylens 1.6.0 · Node 24");
    expect(lastStartedVersion()).toBe("1.6.0");
  });
});
