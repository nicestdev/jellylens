import type { DloadThread, LibraryCopy, TitleRelease, WcxRelease } from "./api-types";
import { MB, seasonCode, seasonLabel } from "./format";
import { rankIn, toggled, type SortDir } from "./facets";
import { matchesWords } from "./text";
import { NO_GROUP, fromRelease, resolutionOf, seasonsOf, withoutTitle } from "./release-labels";
import { audioOf, codecOf, episodesOf } from "./release-name";

// The title page's releases (components/title-view.tsx), xREL's and WCX's
// as one kind of row, so both tables have the same columns and one
// toolbar filters both. No React here, so it's tested on its own.

export type ReleaseRow = {
  id: string;
  name: string;
  episodes: number | null; // how many it holds: one xREL entry's (groupEpisodes), else WCX's count
  group: string | null;
  resolution: string | null; // "2160p", "SD"; null if neither name nor category says
  codec: string; // "x265"; "" if the name doesn't say
  audio: "DL" | "ML" | null;
  size: number | null; // bytes
  date: number | null; // unix seconds
  seasons: [number, number] | null;
  // A library row's (ghostRows): the disks its files are on.
  owned?: string;
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

// The qualities some rows have, each with its release names (one release is
// one name, any case: the lowercase ones), for the Quality segments to count
// what picking one would show, though only the picked ones come down
// (`?resolution=` on the title page's routes).
export type ResolutionNames = Record<string, string[]>;
export function namesByResolution(rows: ReleaseRow[]): ResolutionNames {
  const names: Record<string, Set<string>> = {};
  for (const r of rows) if (r.resolution) (names[r.resolution] ??= new Set()).add(r.name.toLowerCase());
  return Object.fromEntries(Object.entries(names).map(([q, set]) => [q, [...set]]));
}

// The rows of the qualities asked for (all of them with none).
export const inResolutions = (picked: string[]) => (r: ReleaseRow) =>
  !picked.length || picked.includes(r.resolution ?? "");

export const wcxRow = (r: WcxRelease): ReleaseRow => ({
  id: r.uid,
  name: r.name,
  episodes: r.seasonEpisodes,
  group: r.group,
  resolution: r.quality ?? resolutionOf(r.name),
  codec: codecOf(r.name),
  audio: audioOf(r.name),
  size: r.size,
  date: r.createdAt ? Math.floor(Date.parse(r.createdAt) / 1000) : null,
  seasons: r.seasons ?? seasonsOf(r.name),
});

// A DLoad uploader's thread as a row, of their group: no size (DLoad's list has none),
// the day it was opened.
export const dloadRow = (d: DloadThread): ReleaseRow => ({
  id: `dload:${d.id}`,
  name: d.name,
  episodes: null,
  group: d.group,
  resolution: resolutionOf(d.name),
  codec: codecOf(d.name),
  audio: audioOf(d.name),
  size: null,
  date: d.postedAt,
  seasons: seasonsOf(d.name),
});

// What the library already has of a release, for its row on the title page
// (the library icon, the disks): a movie's copies; for a show, those of the
// seasons (or the one episode) the release holds. exact: some of them are
// from this very release (fromRelease), not just the same title. episodes: of a season pack, how many of its episodes the
// library has from it (a combined file counts each). disks: when exact,
// the disks this release's files are on. null if nothing.
export type LibraryMark = { exact: boolean; episodes?: number; disks?: string };

export function libraryNote(r: ReleaseRow, copies: LibraryCopy[], movie: boolean): LibraryMark | null {
  const exact = (list: LibraryCopy[]) => list.filter((c) => fromRelease(c.fileName, r.name)).length;
  const disks = (list: LibraryCopy[]) => ({
    disks: [...new Set(list.filter((c) => fromRelease(c.fileName, r.name)).map((c) => c.path.split("/")[0]))]
      .sort()
      .join(", "),
  });
  if (movie) {
    if (!copies.length) return null;
    const n = exact(copies);
    return { exact: n > 0, ...(n ? disks(copies) : {}) };
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
  const fromIt = mine.filter((c) => fromRelease(c.fileName, r.name) && c.episode !== null);
  const episodes = new Set(
    fromIt.flatMap((c) =>
      Array.from({ length: (c.episodeEnd ?? c.episode!) - c.episode! + 1 }, (_, i) => `${c.season}:${c.episode! + i}`),
    ),
  ).size;
  return {
    exact: n > 0,
    ...(!ep && episodes ? { episodes } : {}),
    ...(n ? disks(mine) : {}),
  };
}

// What the library has of a table's releases, as rows like theirs (its
// name in peach), first (components/title-releases.tsx): one per release its files are
// from, by season (a movie's one), its name the files' without the
// episode and its title ("S01.GERMAN.AC3.720p.WebDL.x264-w00t": from the
// first language or quality tag on, the files' common end without one),
// how many episodes, their size, the disks. One a listed release is
// already marked as owned by (fromRelease) isn't repeated.
const TAG = /(?:^|\.)((?:german|deutsch|dl|ml|ac3d?|eac3|dts|\d{3,4}p|web(?:dl|rip)?|bluray|bdrip|hdtv)\..*)$/i;
// A part said twice in a row counts once, its second spelling
// ("…Krone.German.GERMAN.AC3…" is the season's "GERMAN.AC3…").
export function releaseOf(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{2,4}$/i, "");
  const rest = base.replace(/^.*?\.S\d{1,2}E\d{1,3}(?:-?E\d{1,3})*\./i, "");
  return (TAG.exec(rest)?.[1] ?? rest).replace(/(^|\.)([^.]+)\.(\2)(?=\.|$)/gi, "$1$3");
}
// Dubbed or not is one release here: "AC3D" (the German track from
// another source) and "AC3LD" (line dubbed) count as "AC3".
const undubbed = (name: string) => name.replace(/(?<=^|\.)(e?ac3|dts)l?d(?=\.|$)/gi, "$1");
export function ghostRows(copies: LibraryCopy[], rows: ReleaseRow[], movie: boolean): ReleaseRow[] {
  const rest = copies.filter((c) => !rows.some((r) => fromRelease(c.fileName, r.name)));
  const byRelease = Map.groupBy(rest, (c) =>
    undubbed(movie ? releaseOf(c.fileName) : `${c.season}:${releaseOf(c.fileName)}`),
  );
  return [...byRelease.entries()]
    .map(([key, list]) => {
      // Named after most of its files (dubbed ones and not merged).
      const names = Map.groupBy(list, (x) => releaseOf(x.fileName));
      const c = [...names.values()].sort((a, b) => b.length - a.length)[0][0];
      const season = movie || c.season === null ? null : c.season;
      const name = movie
        ? c.fileName.replace(/\.[a-z0-9]{2,4}$/i, "")
        : `${seasonCode(season ?? 0)}.${releaseOf(c.fileName)}`;
      return {
        id: `library:${key}`,
        name,
        episodes: movie ? null : list.length,
        group: c.group,
        resolution: c.resolution || null,
        codec: c.codec,
        audio: audioOf(c.fileName),
        size: list.reduce((n, x) => n + x.size, 0),
        date: null,
        seasons: season === null ? null : ([season, season] as [number, number]),
        owned: [...new Set(list.map((x) => x.path.split("/")[0]))].sort().join(", "),
      };
    })
    .sort((a, b) => (b.seasons?.[0] ?? 0) - (a.seasons?.[0] ?? 0) || (b.episodes ?? 0) - (a.episodes ?? 0));
}

// Every row of a title page, xREL's and WCX's.
export const allRowsOf = (titles: { items: TitleRelease[] }[], wcx: WcxRelease[]): ReleaseRow[] => [
  ...titles.flatMap((t) => t.items.map(xrelRow)),
  ...wcx.map(wcxRow),
];

// ---- The toolbar

// The quality switch (resolution), the Season and the Group menu.
export type RowFacetKey = "resolution" | "season" | "group";
type RowFilters = Record<RowFacetKey, Set<string>>;
export const noRowFilters = (): RowFilters => ({ resolution: new Set(), season: new Set(), group: new Set() });

// Qualities best first, as a title page's Quality menu lists them.
export const RESOLUTIONS = ["2160p", "1080p", "720p", "576p", "480p", "SD"] as const;
const NONE = "none"; // rows the name says nothing of

const seasonList = (r: ReleaseRow) =>
  r.seasons ? Array.from({ length: r.seasons[1] - r.seasons[0] + 1 }, (_, i) => String(r.seasons![0] + i)) : [];

function valuesOf(key: RowFacetKey, r: ReleaseRow): string[] {
  return key === "season" ? seasonList(r) : key === "group" ? [r.group ?? NO_GROUP] : [r.resolution || NONE];
}

export const FACET_LABELS: Record<RowFacetKey, string> = { resolution: "Quality", season: "Season", group: "Group" };

export function formatFacet(key: RowFacetKey, v: string): string {
  if (v === NONE) return "Unknown";
  if (key === "season") return v === "0" ? "Specials" : seasonCode(Number(v));
  if (key === "group") return v;
  return v === "2160p" ? "4K" : v;
}

// A facet's values over every row, in their order (best quality first,
// seasons up); a facet with fewer than two is no filter.
export function facetValues(key: RowFacetKey, rows: ReleaseRow[]): string[] {
  const list = [...new Set(rows.flatMap((r) => valuesOf(key, r)))];
  if (key === "group") return list.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
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
    const counts = copies.map((c) => c.seasonEpisodes ?? 0);
    const episodes = r.episodes ?? (Math.max(0, ...counts) || null);
    return { ...r, episodes, size: r.size ?? copies[0]?.size ?? null, xrel: true, wcx: copies };
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

// A show's rows by season, newest season first, then specials, then
// Other: what isn't one season's pack (single episodes, a pack of several
// seasons, rows naming none). Each keeps the rows' order. owned: the
// seasons the library has, a table each even without a release of it.
type SeasonGroup<R> = { key: string; label: string; rows: R[] };

export function seasonGroups<R extends ReleaseRow>(rows: R[], owned: number[] = []): SeasonGroup<R>[] {
  const groups = new Map<string, SeasonGroup<R> & { order: [number, number] }>();
  const groupOf = (s: [number, number] | null) => {
    const key = s ? `${s[0]}-${s[1]}` : NONE;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label: !s ? "Other" : seasonLabel(s[0]),
        rows: [],
        // Specials and rows without a season after the numbered ones.
        order: !s ? [-2, -2] : s[0] === 0 && s[1] === 0 ? [-1, -1] : s,
      };
      groups.set(key, g);
    }
    return g;
  };
  for (const n of owned) groupOf([n, n]);
  for (const r of rows) {
    const special = !r.seasons || r.seasons[0] !== r.seasons[1] || Boolean(episodesOf(r.name)?.episodes);
    groupOf(special ? null : r.seasons).rows.push(r);
  }
  return [...groups.values()]
    .sort((a, b) => b.order[0] - a.order[0] || a.order[1] - b.order[1])
    .map(({ order: _order, ...g }) => g);
}
