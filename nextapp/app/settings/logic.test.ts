import { describe, expect, it } from "vitest";
import type { ReleaseGroupItem, StatusResponse } from "@/lib/api-types";
import { show } from "@/test/fixtures";
import { FAST_POLL_MS, ignoredList, pollDelay, SLOW_POLL_MS } from "./logic";

const stage = { syncedAt: "2026-10-01T00:00:00Z", running: false, error: null };
const status = (running: Partial<Record<keyof StatusResponse, boolean>> = {}): StatusResponse => ({
  library: { ...stage, running: Boolean(running.library), movies: 1, shows: 1 },
  tmdb: { ...stage, running: Boolean(running.tmdb), movies: 1, shows: 1 },
  releases: { ...stage, running: Boolean(running.releases), groups: 1, releases: 1 },
  wcx: { ...stage, running: Boolean(running.wcx), releases: 1 },
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
const idle = { busy: false, status: status(), groups: { items: [group()], matching: false } };

describe("pollDelay", () => {
  it("checks back now and then while nothing is under way, or before the first load", () => {
    expect(pollDelay(idle)).toBe(SLOW_POLL_MS);
    expect(pollDelay({ busy: false, status: null, groups: null })).toBe(SLOW_POLL_MS);
  });

  it("follows along while a sync runs, wherever it started", () => {
    expect(pollDelay({ ...idle, busy: true })).toBe(FAST_POLL_MS);
    for (const s of ["library", "tmdb", "releases"] as const) {
      expect(pollDelay({ ...idle, status: status({ [s]: true }) }), s).toBe(FAST_POLL_MS);
    }
  });

  it("follows along while the releases sync checks titles, or a group's releases still load", () => {
    expect(pollDelay({ ...idle, groups: { items: [group()], matching: true } })).toBe(FAST_POLL_MS);
    expect(pollDelay({ ...idle, groups: { items: [group({ syncing: true })], matching: false } })).toBe(FAST_POLL_MS);
    expect(pollDelay({ ...idle, groups: { items: [group({ complete: false })], matching: false } })).toBe(FAST_POLL_MS);
  });
});

describe("ignoredList", () => {
  it("names each ignored show, without its year", () => {
    const shows = [
      {
        ...show({ id: "a", name: "Dark", year: 2017 }),
        missingEpisodes: null,
        languages: null,
      },
      { ...show({ id: "b", name: "Andor" }), missingEpisodes: null, languages: null },
    ];
    const list = ignoredList(shows, [{ showId: "a" }, { showId: "gone" }, { showId: "b" }]);
    expect(list.map((e) => e.name)).toEqual(["Andor", "Dark", "Unknown show"]);
  });
});
