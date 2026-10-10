import type { LibraryCopy, TitleRelease, WcxRelease } from "./api-types";
import { MB, plural, seasonCode } from "./format";
import { rankIn, toggled, type SortDir } from "./facets";
import { matchesWords } from "./text";
import { copyLabel, fromRelease, resolutionOf, seasonsOf, withoutTitle } from "./release-labels";
import { audioOf, codecOf, episodesOf } from "./upgrades";

// The title page's releases (components/title-view.tsx), xREL's and WCX's
// as one kind of row, so both tables have the same columns and one
// toolbar filters both. No React here, so it's tested on its own.

export type ReleaseRow = {
  id: string;
  name: string;
  episodes: number | null; // how many one xREL entry stands for (groupEpisodes)
  group: string | null;
  resolution: string | null; // "2160p", "SD"; null if neither name nor category says
  codec: string; // "x265"; "" if the name doesn't say
  audio: "DL" | "ML" | null;
  size: number | null; // bytes
  date: number | null; // unix seconds
  seasons: [number, number] | null;
};

export const xrelRow = (r: TitleRelease): ReleaseRow => ({
  id: r.id,
  name: r.name,
  episodes: r.episodes ?? null,
  group: r.group,
  resolution: resolutionOf(r.name, r.quality),
  codec: codecOf(r.name),
  audio: audioOf(r.name),
  size: r.sizeMb ? r.sizeMb * MB : null,
  date: r.publishedAt,
  seasons: seasonsOf(r.name),
});

export const wcxRow = (r: WcxRelease): ReleaseRow => ({
  id: r.uid,
  name: r.name,
  episodes: null,
  group: r.group,
  resolution: r.quality ?? resolutionOf(r.name),
  codec: codecOf(r.name),
  audio: audioOf(r.name),
  size: r.size,
  date: r.createdAt ? Math.floor(Date.parse(r.createdAt) / 1000) : null,
  seasons: r.seasons ?? seasonsOf(r.name),
});

// What the library already has of a release, as Downloads says it (its
// icon and tooltip): a movie's copies; for a show, of the seasons (or the
// one episode) the release holds, how many episodes and in what. exact:
// some of them are from this very release (fromRelease), not just the
// same title. null if nothing.
export type LibraryMark = { label: string; hint: string; exact: boolean };

export function libraryNote(r: ReleaseRow, copies: LibraryCopy[], movie: boolean): LibraryMark | null {
  const have = (list: LibraryCopy[]) => [...new Set(list.map(copyLabel))].join(", ");
  const exact = (list: LibraryCopy[]) => list.filter((c) => fromRelease(c.fileName, r.name)).length;
  if (movie) {
    if (!copies.length) return null;
    const n = exact(copies);
    return { label: n ? "This release in library" : "In library", hint: have(copies), exact: n > 0 };
  }
  if (!r.seasons) return null;
  const [from, to] = r.seasons;
  const ep = from === to ? episodesOf(r.name)?.episodes : null;
  const mine = copies.filter(
    (c) =>
      c.season !== null &&
      c.season >= from &&
      c.season <= to &&
      (!ep || (c.episode !== null && ep.some((e) => e >= c.episode! && e <= (c.episodeEnd ?? c.episode!)))),
  );
  if (!mine.length) return null;
  const n = exact(mine);
  const what = ep
    ? n
      ? "This release in library"
      : "In library"
    : `${seasonCode(from, to)}: ${plural(mine.length, "episode")} in library` +
      (n ? (n === mine.length ? ", all of this release" : `, ${n} of this release`) : "");
  return { label: what, hint: have(mine), exact: n > 0 };
}

// Every row of a title page, xREL's and WCX's.
export const allRowsOf = (titles: { Items: TitleRelease[] }[], wcx: WcxRelease[]): ReleaseRow[] => [
  ...titles.flatMap((t) => t.Items.map(xrelRow)),
  ...wcx.map(wcxRow),
];

// ---- The toolbar

// The quality switch (resolution) and the Season menu.
export type RowFacetKey = "resolution" | "season";
type RowFilters = Record<RowFacetKey, Set<string>>;
export const noRowFilters = (): RowFilters => ({ resolution: new Set(), season: new Set() });

// Qualities best first, as a title page's Quality menu lists them.
export const RESOLUTIONS = ["2160p", "1080p", "720p", "576p", "480p", "SD"] as const;
const NONE = "none"; // rows the name says nothing of

const seasonList = (r: ReleaseRow) =>
  r.seasons ? Array.from({ length: r.seasons[1] - r.seasons[0] + 1 }, (_, i) => String(r.seasons![0] + i)) : [];

function valuesOf(key: RowFacetKey, r: ReleaseRow): string[] {
  return key === "season" ? seasonList(r) : [r.resolution || NONE];
}

export const FACET_LABELS: Record<RowFacetKey, string> = { resolution: "Quality", season: "Season" };

export function formatFacet(key: RowFacetKey, v: string): string {
  if (v === NONE) return "Unknown";
  if (key === "season") return v === "0" ? "Specials" : seasonCode(Number(v));
  return v === "2160p" ? "4K" : v;
}

// A facet's values over every row, in their order (best quality first,
// seasons up); a facet with fewer than two is no filter.
export function facetValues(key: RowFacetKey, rows: ReleaseRow[]): string[] {
  const list = [...new Set(rows.flatMap((r) => valuesOf(key, r)))];
  return key === "resolution" ? list.sort((a, b) => rank(a) - rank(b)) : list.sort((a, b) => Number(a) - Number(b));
}
const rank = rankIn(RESOLUTIONS);

// Words match the name; within a facet any value does.
export function keepRow(query: string, filters: RowFilters): (r: ReleaseRow) => boolean {
  const matches = matchesWords(query);
  return (r) => {
    if (!matches(r.name)) return false;
    return (Object.keys(filters) as RowFacetKey[]).every(
      (k) => !filters[k].size || valuesOf(k, r).some((v) => filters[k].has(v)),
    );
  };
}

export const toggleFilter = (f: RowFilters, key: RowFacetKey, value: string): RowFilters => ({
  ...f,
  [key]: toggled(f[key], value),
});

// xREL's and WCX's releases as one list, a row per name (any case): xREL's
// row where it has the release (its size from WCX if xREL has none), else
// WCX's first copy's; wcx: every WCX copy of it (WCX lists some twice),
// those with a live mirror first. Newest first.
type CombinedRow = ReleaseRow & { xrel: boolean; wcx: WcxRelease[] };

const live = (r: WcxRelease) => r.mirrors.some((m) => !m.offline);

export function combineRows(xrel: ReleaseRow[], wcx: WcxRelease[]): CombinedRow[] {
  const byName = new Map<string, WcxRelease[]>();
  for (const w of wcx) {
    const key = w.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), w]);
  }
  for (const list of byName.values()) list.sort((a, b) => Number(live(b)) - Number(live(a)));
  const rows: CombinedRow[] = xrel.map((r) => {
    const copies = byName.get(r.name.toLowerCase()) ?? [];
    return { ...r, size: r.size ?? copies[0]?.size ?? null, xrel: true, wcx: copies };
  });
  const onXrel = new Set(xrel.map((r) => r.name.toLowerCase()));
  for (const [key, copies] of byName)
    if (!onXrel.has(key)) rows.push({ ...wcxRow(copies[0]), xrel: false, wcx: copies });
  return rows.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
}

// The title page's sort menu: newest first unless picked otherwise.
export const RELEASE_SORTS = [
  { key: "date", label: "Date", defaultDir: "desc" },
  { key: "size", label: "Size", defaultDir: "desc" },
  { key: "name", label: "Title", defaultDir: "asc" },
] as const;
export type ReleaseSortKey = (typeof RELEASE_SORTS)[number]["key"];

// Rows by date, size or name (as shown, without the title); one without a
// date or size goes last either way, ties newest first.
export function sortRows<R extends ReleaseRow>(rows: R[], key: ReleaseSortKey, dir: SortDir): R[] {
  const sign = dir === "asc" ? 1 : -1;
  const name = (r: R) => withoutTitle(r.name, { keepEpisode: true });
  const byKey = (a: R, b: R) => {
    if (key === "name") return sign * name(a).localeCompare(name(b), undefined, { sensitivity: "base" });
    const x = a[key];
    const y = b[key];
    if (x === null || y === null) return Number(x === null) - Number(y === null);
    return sign * (x - y);
  };
  return [...rows].sort((a, b) => byKey(a, b) || (b.date ?? 0) - (a.date ?? 0));
}
