import { describe, expect, it } from "vitest";
import type { LogEntry } from "@/lib/api-types";
import { copyText, logDays, logStamp, logTime, logsQuery } from "./logic";

// vitest.config.mts runs the tests in UTC.
const line = (id: number, at: string, over: Partial<LogEntry> = {}): LogEntry => ({
  id,
  at,
  level: "info",
  area: "app",
  message: "m" + id,
  ...over,
});

describe("logs page logic", () => {
  it("writes the time and the date, and the zone for a copy", () => {
    expect(logTime("2026-10-17T04:32:25.123Z")).toBe("04:32:25 17.10.2026");
    expect(logStamp("2026-10-17T04:32:25.123Z")).toBe("2026-10-17 04:32:25 +00:00");
  });

  it("heads each day Today, Yesterday or its weekday and date", () => {
    const days = logDays(
      [line(3, "2026-10-17T09:00:00Z"), line(2, "2026-10-16T23:00:00Z"), line(1, "2026-10-15T08:00:00Z")],
      new Date("2026-10-17T12:00:00Z"),
    );
    expect(days.map((d) => [d.label, d.entries.map((e) => e.id)])).toEqual([
      ["Today", [3]],
      ["Yesterday", [2]],
      ["Thursday, 15.10.2026", [1]],
    ]);
  });

  it("asks for the filters and a page", () => {
    expect(logsQuery({ q: "", levels: new Set(), areas: new Set() })).toBe("/api/logs");
    expect(logsQuery({ q: " heat ", levels: new Set(["error", "warn"]), areas: new Set(["xrel"]) }, "before=9")).toBe(
      "/api/logs?q=heat&level=error%2Cwarn&area=xrel&before=9",
    );
  });

  it("copies the lines oldest first, one each", () => {
    expect(
      copyText([
        line(2, "2026-10-17T04:32:25Z", { level: "error", area: "xrel", message: "Releases sync failed" }),
        line(1, "2026-10-17T04:32:18Z", { message: "Started" }),
      ]),
    ).toBe(
      "2026-10-17 04:32:18 +00:00 INFO  [app] Started\n2026-10-17 04:32:25 +00:00 ERROR [xrel] Releases sync failed",
    );
  });
});
