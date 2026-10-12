import { describe, expect, it } from "vitest";
import type { MissingSeason, OrganizeMoved, RequestItem, ShowItem } from "@/lib/api-types";
import { show } from "@/test/fixtures";
import { diskLow, freeShare, missingShows, openWishlist, recentImports, totalFree } from "./logic";

const season = (n: number, over: Partial<MissingSeason> = {}): MissingSeason => ({
  season: n,
  episodes: "1-2",
  wholeSeason: false,
  ended: true,
  count: 2,
  total: 10,
  episodeStates: [],
  ...over,
});

const item = (id: string, seasons: MissingSeason[]): ShowItem => ({
  ...show({ id: id }),
  missingEpisodes: seasons.length ? { count: seasons.reduce((s, x) => s + x.count, 0), seasons } : null,
  languages: null,
});

const moved = (id: number, movedAt: string): OrganizeMoved => ({
  id,
  name: `Release.${id}`,
  media: null,
  movedTo: "nvme01/movies/X",
  movedAt,
  files: [],
  bytes: 0,
  replaced: false,
  move: null,
});

const request = (tmdbId: number, requestedAt: string, owned = false) =>
  ({ tmdbId, requestedAt, library: owned ? { id: "j" } : null }) as RequestItem;

describe("missingShows", () => {
  it("lists every show with a gap, finished or airing, most missing first, then by name", () => {
    const shows = [
      item("b", [season(1, { count: 3 })]),
      item("a", [season(2, { count: 1, ended: false }), season(1, { count: 2 })]),
      item("c", [season(1, { count: 1 })]),
      item("none", []),
    ];
    expect(missingShows(shows, []).map((m) => [m.item.id, m.seasons.map((s) => s.season), m.count])).toEqual([
      ["a", [1, 2], 3],
      ["b", [1], 3],
      ["c", [1], 1],
    ]);
  });

  it("leaves out ignored seasons and shows", () => {
    const shows = [item("a", [season(1), season(2)]), item("b", [season(1)])];
    const ignored = [
      { showId: "a", season: 1 },
      { showId: "b", season: null },
    ];
    expect(missingShows(shows, ignored).map((m) => [m.item.id, m.seasons.map((s) => s.season)])).toEqual([["a", [2]]]);
  });
});

describe("openWishlist", () => {
  it("keeps what the library doesn't have, latest added first", () => {
    const items = [request(1, "2026-10-01"), request(2, "2026-10-03", true), request(3, "2026-10-02")];
    expect(openWishlist(items).map((r) => r.tmdbId)).toEqual([3, 1]);
  });
});

describe("disks", () => {
  it("says how much is free, red under 5 %", () => {
    const full = { disk: "nvme01", freeBytes: 4, totalBytes: 100 };
    const roomy = { disk: "nvme02", freeBytes: 50, totalBytes: 100 };
    const unknown = { disk: "nvme03", freeBytes: null, totalBytes: null };
    expect([full, roomy, unknown].map(freeShare)).toEqual([0.04, 0.5, 1]);
    expect([full, roomy, unknown].map(diskLow)).toEqual([true, false, false]);
    expect(totalFree([full, roomy, unknown])).toBe(54);
  });
});

describe("recentImports", () => {
  it("keeps the last 7 days' moves, newest first", () => {
    const now = new Date("2026-10-11T12:00:00Z").getTime();
    const list = [
      moved(1, "2026-10-04T13:00:00Z"),
      moved(2, "2026-10-10T12:00:00Z"),
      moved(3, "2026-10-04T11:00:00Z"),
      moved(4, "2026-10-11T08:00:00Z"),
    ];
    expect(recentImports(list, now).map((m) => m.id)).toEqual([4, 2, 1]);
  });
});
