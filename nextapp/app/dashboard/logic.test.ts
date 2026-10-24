import { describe, expect, it } from "vitest";
import type {
  DownloadFileItem,
  DownloadPackageItem,
  MissingSeason,
  OrganizeMoved,
  RequestItem,
  OrganizeItem,
  ShowItem,
} from "@/lib/api-types";
import type { MoveProgress } from "@/lib/library-move";
import { show } from "@/test/fixtures";
import {
  diskLow,
  freeShare,
  importTiles,
  missingShows,
  openWishlist,
  pendingNote,
  queueRows,
  recentImports,
  seasonsLabel,
  totalFree,
} from "./logic";

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

  it("leaves out ignored shows", () => {
    const shows = [item("a", [season(1), season(2)]), item("b", [season(1)])];
    expect(missingShows(shows, [{ showId: "b" }]).map((m) => [m.item.id, m.seasons.map((s) => s.season)])).toEqual([
      ["a", [1, 2]],
    ]);
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

describe("importTiles", () => {
  const show = { type: "tv" as const, tmdbId: 95396, title: "Severance", year: 2022, posterPath: null };
  const season = (id: number, n: number, movedAt: string) => ({
    ...moved(id, movedAt),
    media: show,
    name: `Severance.S0${n}.German.DL.1080p.WEB.H264-WvF`,
    files: [`Season 0${n}/Severance.S0${n}E01.mkv`],
  });

  it("combines a show's seasons into one tile, at its latest move, with all of them", () => {
    const tiles = importTiles([
      season(1, 2, "2026-10-10T12:00:00Z"),
      moved(2, "2026-10-09T12:00:00Z"),
      season(3, 1, "2026-10-08T12:00:00Z"),
    ]);
    expect(tiles.map((t) => [t.key, t.movedAt, t.seasons])).toEqual([
      ["tv:95396", "2026-10-10T12:00:00Z", [1, 2]],
      ["move:2", "2026-10-09T12:00:00Z", []],
    ]);
  });

  it("reads a season from the release's name when its files have no season folder", () => {
    expect(
      importTiles([{ ...season(1, 3, "2026-10-10T12:00:00Z"), files: ["Severance.S03E01.mkv"] }])[0].seasons,
    ).toEqual([3]);
  });

  it("names the seasons, a run of them as a range", () => {
    expect(seasonsLabel([1, 2, 3, 5])).toBe("S01–S03, S05");
    expect(seasonsLabel([2])).toBe("S02");
    expect(seasonsLabel([])).toBe("");
  });
});

describe("pendingNote", () => {
  const part: DownloadFileItem = {
    id: 1,
    name: "a.mkv",
    url: "",
    size: 1,
    received: 0,
    status: "queued",
    error: null,
    speed: null,
    checked: "online",
  };
  const lib = (over: Partial<NonNullable<DownloadPackageItem["library"]>>) => ({
    old: [],
    new: ["S01E05"],
    exact: false,
    skip: 0,
    choices: [],
    disks: ["nvme02"],
    presumed: [],
    ...over,
  });
  const wait = (over: Partial<DownloadPackageItem>) =>
    pendingNote({
      status: "pending",
      media: { type: "tv", tmdbId: 1 },
      library: null,
      files: [part],
      ...over,
    } as DownloadPackageItem);

  it("says Error for a part that can't be fetched or is missing, Needs attention when it needs a hand", () => {
    expect(wait({ files: [{ ...part, status: "failed", error: "No account for its hoster" }] })).toEqual({
      line: ["Error"],
      tone: "error",
    });
    expect(
      wait({
        files: [
          { ...part, name: "a.part1.rar" },
          { ...part, name: "a.part3.rar" },
        ],
      }),
    ).toEqual({
      line: ["Error"],
      tone: "error",
    });
    expect(wait({ media: null })).toEqual({ line: ["Needs attention"], tone: "warning" });
    expect(wait({ library: lib({}) })).toEqual({ line: ["Needs attention"], tone: "warning" });
  });

  it("leaves one out while it's checked, or when it only waits for a hoster", () => {
    expect(wait({ files: [{ ...part, checked: null }] })).toBeNull();
    expect(wait({})).toBeNull();
  });
});

describe("queueRows", () => {
  const progress: MoveProgress = {
    target: "",
    done: 1,
    total: 4,
    speed: 0,
    running: true,
    error: null,
  };
  const item = (id: number, move: Partial<MoveProgress> | null, error: string | null = null) =>
    ({
      id,
      name: `Item.${id}`,
      media: null,
      error,
      files: ["a", "b"],
      owned: [],
      move: move && { ...progress, ...move },
    }) as unknown as OrganizeItem;
  const pkg = (id: number, status: DownloadPackageItem["status"], error: string | null = null) =>
    ({ id, name: `Pkg.${id}`, media: null, status, error, files: [] }) as unknown as DownloadPackageItem;

  it("says where each is at: a failure's reason, a download's state, Ready, a move's state", () => {
    const rows = queueRows([
      {
        title: "Needs attention",
        packages: [pkg(1, "failed", "Wrong archive password")],
        items: [item(2, null, "No video in it.")],
        moved: [],
        pending: [],
      },
      { title: "Downloading", packages: [pkg(3, "downloading"), pkg(4, "paused")], items: [], moved: [], pending: [] },
      {
        title: "Ready to organize",
        packages: [],
        items: [item(5, null), item(6, {}), item(8, { running: false })],
        moved: [],
        pending: [],
      },
    ]);
    expect(rows.map((r) => [r.line.join("·"), r.tone])).toEqual([
      ["Error", "error"],
      ["Error", "error"],
      ["Loading·0\u202f%", "success"],
      ["Paused·0\u202f%", undefined],
      ["Ready to organize", undefined],
      ["Moving·25\u202f%", "success"],
      ["Waiting·25\u202f%", undefined],
    ]);
  });
});
