import { mockLogs } from "./logs";
import { describe, expect, it } from "vitest";
import { sections } from "@/app/queue/logic";
import { mockDownloads, mockOrganize } from "./data";
import { mockConfig, mockPreferences, mockReleaseGroups, mockStatus } from "./settings";

// Mock data's made-up data builds (its types are the routes' own, so the
// typecheck covers its shape) and shows what it's meant to.
describe("mock data", () => {
  it("fills every section of the Queue", () => {
    expect(sections(mockDownloads().packages, mockOrganize()).map((s) => s.title)).toEqual([
      "Needs attention",
      "Downloading",
      "Ready to organize",
      "Done",
    ]);
  });

  it("has a stage running and one never synced, a key missing, and groups in each state", () => {
    const status = mockStatus();
    expect(Object.values(status).some((s) => s.running)).toBe(true);
    expect(Object.values(status).some((s) => s.syncedAt === null)).toBe(true);
    expect(mockConfig().realDebridToken).toBe("");
    const groups = mockReleaseGroups().items;
    expect(groups.some((g) => g.syncing && g.complete)).toBe(true);
    expect(groups.some((g) => g.syncing && !g.complete)).toBe(true);
    expect(groups.some((g) => !g.syncing && !g.complete)).toBe(true);
    expect(mockPreferences()).toEqual({ showSdReleases: false });
  });

  it("logs every level, and filters the way the route does", () => {
    const logs = (q = "") => mockLogs(new URL("http://x/api/logs" + q)).entries;
    expect(new Set(logs().map((e) => e.level))).toEqual(new Set(["info", "warn", "error"]));
    expect(logs("?level=error").every((e) => e.level === "error")).toBe(true);
    expect(logs("?after=1")).toEqual([]);
  });
});
