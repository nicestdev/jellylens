import { expect, it } from "vitest";
import type { MigrationRow } from "@/lib/api-types";
import { migrationView, pickLabel, sizeTone, sourcesOf, splitPick, withNots, type MigrationFilters } from "./logic";

const row = (title: string, over: Partial<MigrationRow> = {}): MigrationRow => ({
  have: [],
  kind: "replace",
  target: "w00t",
  type: "movie",
  tmdbId: 1,
  title,
  year: 2000,
  season: null,
  groups: ["VECTOR"],
  resolution: "1080p",
  size: 1,
  episodes: null,
  offers: [{ name: `${title} 2000 GERMAN 1080p BluRay - w00t`, links: [], size: null, whole: false }],
  ...over,
});

const none = (): MigrationFilters => ({
  query: "",
  types: new Set(),
  sources: new Set(),
  notSources: new Set(),
  sourceQualities: new Set(),
  targets: new Set(),
  notTargets: new Set(),
  targetQualities: new Set(),
  noMigration: false,
});
const titles = (rows: MigrationRow[], f: Partial<MigrationFilters>) =>
  migrationView(rows, { ...none(), ...f }, "size", "desc").map((r) => `${r.title}>${r.target}`);

it("filters by type and the source's and target's quality, biggest first", () => {
  const rows = [
    row("Heat", { size: 5 }),
    row("Alien", {
      size: 9,
      offers: [{ name: "Alien 1979 GERMAN 2160p UHD BluRay - w00t", links: [], size: null, whole: false }],
    }),
    row("Arrow", { type: "tv", season: 1, size: 7, resolution: "720p" }),
  ];
  expect(titles(rows, {})).toEqual(["Alien>w00t", "Arrow>w00t", "Heat>w00t"]);
  expect(titles(rows, { targetQualities: new Set(["1080p"]) })).toEqual(["Arrow>w00t", "Heat>w00t"]);
  expect(titles(rows, { types: new Set(["movie"]), targetQualities: new Set(["1080p"]) })).toEqual(["Heat>w00t"]);
  expect(titles(rows, { sourceQualities: new Set(["720p"]) })).toEqual(["Arrow>w00t"]);
});

it("filters by source and target, each with its not", () => {
  const rows = [
    row("Heat", { groups: ["w00t"], target: "FuN", size: 3 }),
    row("Heat", { groups: ["VECTOR"], target: "w00t", size: 2 }),
    row("Alien", { groups: ["w00t"], target: "w00t", kind: "upgrade", size: 1 }),
  ];
  expect(sourcesOf(rows)).toEqual(["VECTOR", "w00t"]);
  expect(titles(rows, { targets: new Set(["FuN"]), notSources: new Set(["w00t"]) })).toEqual([]);
  expect(titles(rows, { notTargets: new Set(["FuN"]) })).toEqual(["Heat>w00t", "Alien>w00t"]);
  expect(titles(rows, { sources: new Set(["w00t"]), targets: new Set(["w00t"]) })).toEqual(["Alien>w00t"]);
});

it("shows the rows without a migration only when No migration is picked", () => {
  const rows = [
    row("Heat", { size: 3 }),
    row("Alien", { kind: "none", target: "", offers: [], groups: ["w00t"], resolution: "4K", size: 2 }),
  ];
  expect(titles(rows, {})).toEqual(["Heat>w00t"]);
  expect(titles(rows, { noMigration: true })).toEqual(["Alien>"]);
  expect(titles(rows, { noMigration: true, targets: new Set(["w00t"]) })).toEqual(["Heat>w00t", "Alien>"]);
  expect(titles(rows, { noMigration: true, sourceQualities: new Set(["1080p"]) })).toEqual([]);
});

it("lists a menu's groups, then each as a not, then the qualities", () => {
  expect(withNots(["FuN", "w00t"]).map(pickLabel)).toEqual([
    "FuN",
    "w00t",
    "not FuN",
    "not w00t",
    "SD",
    "720p",
    "1080p",
    "4K",
  ]);
  expect(splitPick(new Set(["FuN", "!w00t", "@4K"]))).toEqual({
    yes: new Set(["FuN"]),
    no: new Set(["w00t"]),
    qualities: new Set(["4K"]),
    none: false,
  });
});

it("tones an offer's size against the library's, only the same thing", () => {
  const offer = (size: number | null, whole = true) => ({ name: "x", links: [], size, whole });
  expect([
    sizeTone(offer(5), 8),
    sizeTone(offer(9), 8),
    sizeTone(offer(null), 8),
    sizeTone(offer(5, false), 8),
  ]).toEqual(["better", "worse", null, null]);
});
