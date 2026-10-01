import type { AnalyticsResponse, FilePart, LibraryAnalytics } from "@/lib/api-types";
import type { SortDir } from "@/lib/facets";
import { formatBytes, formatNumber, plural, relativeTime } from "@/lib/format";
import { languageName } from "@/lib/languages";

// What the Analytics page works out from /api/analytics, per library
// (movies, shows): the overview's tiles, the share chart's pieces, and the
// file list's filter menu and requests (the server searches, filters and
// pages the files). No React here, so it's tested on its own
// (logic.test.ts).

type Stats = LibraryAnalytics;
export type Library = "movies" | "shows";

// What a title is in each library.
const UNIT: Record<Library, { titles: string; title: string }> = {
  movies: { titles: "Movies", title: "movie" },
  shows: { titles: "Shows", title: "show" },
};

export type Tile = { label: string; value: string; hint: string };

const ungroupedOf = (m: Stats) => m.groups.find((g) => g.value === null)?.files ?? 0;

// The average is per movie or show, over those with files, so ones still
// waiting for their first sync since files were stored don't pull it down.
// Movies mostly have one file each, so their second tile is the average;
// a show's is how many episode files it all comes to.
export function overviewTiles(m: Stats, library: Library = "movies"): Tile[] {
  const { withFiles } = m;
  const unit = UNIT[library];
  const grouped = m.files - ungroupedOf(m);
  const percent = m.files ? Math.round((grouped / m.files) * 100) : 0;
  const average = formatBytes(withFiles ? m.size / withFiles : 0);
  const second: Tile[] =
    library === "movies"
      ? [
          { label: "Average size", value: average, hint: "per movie" },
          { label: "Total size", value: formatBytes(m.size), hint: `in ${plural(m.files, "file")}` },
        ]
      : [
          { label: "Files", value: formatNumber(m.files), hint: `episodes of ${plural(withFiles, "show")}` },
          { label: "Total size", value: formatBytes(m.size), hint: `Ø ${average} per ${unit.title}` },
        ];
  return [
    { label: unit.titles, value: formatNumber(m.titles), hint: "in the library" },
    ...second,
    {
      label: "Release groups",
      value: formatNumber(m.groups.filter((g) => g.value !== null).length),
      hint: `named in ${percent} % of files`,
    },
  ];
}

export function subtitle(data: AnalyticsResponse | null): string {
  if (!data) return "Loading…";
  return `From the Jellyfin sync ${relativeTime(data.syncedAt)}`;
}

// ---- The share chart

// The file list's filters, which a click on a piece sets too: by group,
// resolution, codec and audio language, "" standing for files without a
// group, an unknown resolution or codec, or no language tagged.
export type Dimension = "groups" | "resolutions" | "codecs" | "languages";
export type ListFilters = Record<Dimension, Set<string>>;
export const noListFilters = (): ListFilters => ({
  groups: new Set(),
  resolutions: new Set(),
  codecs: new Set(),
  languages: new Set(),
});

// Every ring's colors, in this order (checked for color blindness against
// the card's color, so keep it): its pieces with the most files first.
// What's folded into "other" and what's unknown in grays.
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
const OTHER_COLOR = "#5c606b";
const NONE_COLOR = "#3b3e46";

// A part of the share chart. Files, not titles: every file has exactly one
// group, resolution and codec (or none), so the parts add up to the whole.
// dimension and values: the file list's filter that shows its files.
export type Segment = {
  key: string;
  label: string;
  files: number;
  size: number;
  color: string;
  muted: boolean;
  dimension: Dimension;
  values: string[];
};

const sum = (parts: FilePart[]) =>
  parts.reduce((t, p) => ({ files: t.files + p.files, size: t.size + p.size }), { files: 0, size: 0 });

// The parts (most files first, as /api/analytics sends them) in the
// series colors, the rest folded into one "N other …" piece, and the
// unknown one ("") last.
function segmentsOf(dimension: Dimension, parts: FilePart[], names: { other: string; none: string }): Segment[] {
  const known = parts.filter((p) => p.value !== "");
  const top = known.slice(0, SERIES_COLORS.length);
  const rest = known.slice(SERIES_COLORS.length);
  const unknown = parts.find((p) => p.value === "");
  const segments: Segment[] = top.map((p, i) => ({
    key: `${dimension}:${p.value}`,
    label: p.value,
    files: p.files,
    size: p.size,
    color: SERIES_COLORS[i],
    muted: false,
    dimension,
    values: [p.value],
  }));
  if (rest.length) {
    segments.push({
      key: `${dimension}-other`,
      label: plural(rest.length, names.other),
      ...sum(rest),
      color: OTHER_COLOR,
      muted: true,
      dimension,
      values: rest.map((p) => p.value),
    });
  }
  if (unknown?.files) {
    segments.push({
      key: `${dimension}-none`,
      label: names.none,
      files: unknown.files,
      size: unknown.size,
      color: NONE_COLOR,
      muted: true,
      dimension,
      values: [""],
    });
  }
  return segments;
}

const groupParts = (m: Stats): FilePart[] => m.groups.map((g) => ({ ...g, value: g.value ?? "" }));

export const groupSegments = (m: Stats) => segmentsOf("groups", groupParts(m), { other: "other group", none: NO_GROUP_NAME });
export const resolutionSegments = (m: Stats) =>
  segmentsOf("resolutions", m.resolutions, { other: "other resolution", none: "Unknown" });
export const codecSegments = (m: Stats) => segmentsOf("codecs", m.codecs, { other: "other codec", none: "Unknown" });

// The audio languages' rings: German, English and Spanish, always in that
// order and color, those the library has. A file can have several, so
// there's no "other" piece (it would count files twice); the filter menu
// has every language, and files with none tagged.
const LANGUAGE_RINGS = ["DE", "EN", "ES"];
export function languageSegments(m: Stats): Segment[] {
  return LANGUAGE_RINGS.flatMap((code, i): Segment[] => {
    const p = m.languages.find((l) => l.value === code);
    if (!p?.files) return [];
    return [
      {
        key: `languages:${code}`,
        label: languageLabel(code),
        files: p.files,
        size: p.size,
        color: SERIES_COLORS[i],
        muted: false,
        dimension: "languages",
        values: [code],
      },
    ];
  });
}

// "58 %", "<1 %" for a sliver that's there but rounds to nothing, ">99 %"
// for all but a sliver.
export function percent(part: number, total: number): string {
  if (!total || !part) return "0 %";
  const p = Math.round((part / total) * 100);
  if (p === 0) return "<1 %";
  return p === 100 && part < total ? ">99 %" : `${p} %`;
}

// The pieces whose files the filters show now: those whose dimension's
// filter is exactly theirs.
export function selectedSegments(segments: Segment[], filters: ListFilters): Set<string> {
  return new Set(
    segments
      .filter((s) => {
        const selected = filters[s.dimension];
        return selected.size === s.values.length && s.values.every((v) => selected.has(v));
      })
      .map((s) => s.key)
  );
}

// ---- The file list

export const FILE_SORTS = [
  { key: "title", label: "Title", defaultDir: "asc" },
  { key: "size", label: "Size", defaultDir: "desc" },
  { key: "group", label: "Group", defaultDir: "asc" },
] as const;
export type FileSortKey = (typeof FILE_SORTS)[number]["key"];

// Files without a group, wherever they're named.
const NO_GROUP_NAME = "n/a";
export const groupName = (g: string) => g || NO_GROUP_NAME;
export const resolutionName = (r: string) => r || "Unknown";
export const codecName = (c: string) => c || "Unknown";
export const languageLabel = (code: string) => (code ? languageName(code) : "None tagged");

// Best first, then files Jellyfin knows no resolution for.
const RESOLUTIONS = ["4K", "1080p", "720p", "SD", ""];

// The filter menu's values with their counts, over every file (so the menu
// doesn't shrink as you filter): groups, codecs and languages most files first,
// resolutions best first, what's unknown last.
export function fileFacets(m: Stats): Record<Dimension, { values: string[]; counts: Map<string, number> }> {
  const facet = (parts: FilePart[], order?: string[]) => {
    const values = parts.map((p) => p.value);
    return {
      values: order ? order.filter((v) => values.includes(v)) : [...values.filter(Boolean), ...values.filter((v) => !v)],
      counts: new Map(parts.map((p) => [p.value, p.files])),
    };
  };
  return {
    groups: facet(groupParts(m)),
    resolutions: facet(m.resolutions, RESOLUTIONS),
    codecs: facet(m.codecs),
    languages: facet(m.languages),
  };
}

const PARAM: Record<Dimension, string> = { groups: "group", resolutions: "resolution", codecs: "codec", languages: "language" };

// The /api/analytics/files request for one page of a library's list.
export function filesUrl(
  library: Library,
  query: string,
  filters: ListFilters,
  sortKey: FileSortKey,
  sortDir: SortDir,
  offset: number
): string {
  const qs = new URLSearchParams({ library, q: query.trim(), sort: sortKey, dir: sortDir, offset: String(offset) });
  for (const d of Object.keys(PARAM) as Dimension[]) for (const v of filters[d]) qs.append(PARAM[d], v);
  return "/api/analytics/files?" + qs;
}

// "1–50 of 649 files", "No files".
export function pageText(offset: number, shown: number, matched: number): string {
  if (!matched) return "No files";
  return `${formatNumber(offset + 1)}–${formatNumber(offset + shown)} of ${plural(matched, "file")}`;
}
