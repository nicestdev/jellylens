import { describe, expect, it } from "vitest";
import type { ReleaseGroupItem, StatusResponse } from "@/lib/api-types";
import { FAST_POLL_MS, pollDelay, SLOW_POLL_MS } from "./logic";

const stage = { syncedAt: "2026-10-01T00:00:00Z", running: false, error: null };
const status = (running: Partial<Record<keyof StatusResponse, boolean>> = {}): StatusResponse => ({
  library: { ...stage, running: Boolean(running.library), movies: 1, shows: 1 },
  tmdb: { ...stage, running: Boolean(running.tmdb), shows: 1, collections: 1 },
  missing: {
    ...stage,
    running: Boolean(running.missing),
    incompleteCount: 0,
    incompleteCollectionCount: 0,
    mismatchCount: 0,
  },
  releases: { ...stage, running: Boolean(running.releases), groups: 1, releases: 1 },
});
const group = (over: Partial<ReleaseGroupItem> = {}): ReleaseGroupItem => ({
  id: "g1",
  kind: "p2p",
  name: "VECTOR",
  count: 1,
  syncedAt: null,
  complete: true,
  syncing: false,
  ...over,
});
const idle = { busy: false, status: status(), groups: { Items: [group()], matching: false } };

describe("pollDelay", () => {
  it("checks back now and then while nothing is under way, or before the first load", () => {
    expect(pollDelay(idle)).toBe(SLOW_POLL_MS);
    expect(pollDelay({ busy: false, status: null, groups: null })).toBe(SLOW_POLL_MS);
  });

  it("follows along while a sync runs, wherever it started", () => {
    expect(pollDelay({ ...idle, busy: true })).toBe(FAST_POLL_MS);
    for (const s of ["library", "tmdb", "missing", "releases"] as const) {
      expect(pollDelay({ ...idle, status: status({ [s]: true }) }), s).toBe(FAST_POLL_MS);
    }
  });

  it("follows along while the releases sync checks titles, or a group's releases still load", () => {
    expect(pollDelay({ ...idle, groups: { Items: [group()], matching: true } })).toBe(FAST_POLL_MS);
    expect(pollDelay({ ...idle, groups: { Items: [group({ syncing: true })], matching: false } })).toBe(FAST_POLL_MS);
    expect(pollDelay({ ...idle, groups: { Items: [group({ complete: false })], matching: false } })).toBe(FAST_POLL_MS);
  });
});
