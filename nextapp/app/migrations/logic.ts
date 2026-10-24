import type { MigrationRow } from "@/lib/api-types";
import { sortedBy, type SortDir } from "@/lib/facets";
import { matchesWords } from "@/lib/text";

// How Migrations sorts: Size (the biggest first, where the target's copy
// saves the most), Title A→Z.
export const MIGRATION_SORTS = [
  { key: "size", label: "Size", defaultDir: "desc" },
  { key: "title", label: "Title", defaultDir: "asc" },
] as const;
export type MigrationSortKey = (typeof MIGRATION_SORTS)[number]["key"];

export const TYPES = ["movie", "tv"] as const;
export const typeLabel = (t: string) => (t === "movie" ? "Movies" : "Shows");

// The qualities at the end of the Source and the Target menu, lowest first:
// the library's files' resolution, the target's releases' read from their
// names.
export const QUALITIES = ["SD", "720p", "1080p", "4K"];
export const offerQuality = (title: string) =>
  /2160p/i.test(title) ? "4K" : /1080p/i.test(title) ? "1080p" : /720p/i.test(title) ? "720p" : "SD";

// An offer's size against what the library has of it: smaller is better
// (green), bigger worse (red); none for one that isn't the same thing (an
// episode, a pack of seasons) or of unknown size.
export function sizeTone(o: MigrationRow["offers"][number], librarySize: number): "better" | "worse" | null {
  if (!o.whole || o.size === null || o.size === librarySize) return null;
  return o.size < librarySize ? "better" : "worse";
}

export const rowKey = (r: MigrationRow) => `${r.target}:${r.kind}:${r.type}:${r.tmdbId}:${r.season ?? ""}`;

// What the menus pick from (none picked: all). Source: a row's files'
// groups, any of them; Source not: none of them; Source quality: the
// files' resolution. Target and Target not: the group that offers it;
// Target quality: keeps only a row's offers of it. noMigration: the
// movies and seasons no target has a row of, alone or beside the picked
// targets' (never shown otherwise).
export type MigrationFilters = {
  query: string;
  types: Set<string>;
  sources: Set<string>;
  notSources: Set<string>;
  sourceQualities: Set<string>;
  targets: Set<string>;
  notTargets: Set<string>;
  targetQualities: Set<string>;
  noMigration: boolean;
};

// The Source and the Target menu each list the groups, then (after a line)
// each again as "not …", picked as "!name", then (after another) the
// qualities, picked as "@4K": a pick's groups, its nots and its qualities.
// The Target menu ends with No migration (NO_MIGRATION), after one more line.
export const NO_MIGRATION = "-";
export const withNots = (names: string[]) => [...names, ...names.map((n) => "!" + n), ...QUALITIES.map((q) => "@" + q)];
export const pickLabel = (value: string) =>
  value === NO_MIGRATION
    ? "No migration"
    : value.startsWith("!")
      ? "not " + value.slice(1)
      : value.startsWith("@")
        ? value.slice(1)
        : value;
const picks = (picked: Set<string>, mark: string) =>
  new Set([...picked].filter((v) => v.startsWith(mark)).map((v) => v.slice(1)));
export const splitPick = (picked: Set<string>) => ({
  yes: new Set([...picked].filter((v) => v !== NO_MIGRATION && !v.startsWith("!") && !v.startsWith("@"))),
  no: picks(picked, "!"),
  qualities: picks(picked, "@"),
  none: picked.has(NO_MIGRATION),
});

// The Source menu's groups: every group the rows' files are from, A→Z.
export const sourcesOf = (rows: MigrationRow[]) =>
  [...new Set(rows.flatMap((r) => r.groups))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

// The search (title, groups) and the menus, then the sort; ties by title
// and season.
export function migrationView(rows: MigrationRow[], f: MigrationFilters, key: MigrationSortKey, dir: SortDir) {
  const matches = matchesWords(f.query.trim());
  const shown = rows
    .map((r) =>
      f.targetQualities.size
        ? { ...r, offers: r.offers.filter((o) => f.targetQualities.has(offerQuality(o.name))) }
        : r,
    )
    .filter(
      (r) =>
        (r.kind === "none" ? f.noMigration : r.offers.length > 0 && !(f.noMigration && f.targets.size === 0)) &&
        (f.types.size === 0 || f.types.has(r.type)) &&
        (f.sources.size === 0 || r.groups.some((g) => f.sources.has(g))) &&
        !r.groups.some((g) => f.notSources.has(g)) &&
        (f.sourceQualities.size === 0 || f.sourceQualities.has(r.resolution)) &&
        (f.targets.size === 0 || r.kind === "none" || f.targets.has(r.target)) &&
        !f.notTargets.has(r.target) &&
        matches(`${r.title} ${r.groups.join(" ")}`),
    );
  const byTitle = sortedBy(
    sortedBy(shown, (r) => r.season ?? 0, "asc"),
    (r) => r.title.toLowerCase(),
    "asc",
  );
  return key === "title" ? sortedBy(byTitle, (r) => r.title.toLowerCase(), dir) : sortedBy(byTitle, (r) => r.size, dir);
}
