import type { Library } from "@/lib/libraries";
import type { AnalyticsResponse, FilePart, LibraryAnalytics } from "@/lib/api-types";
import type { SortDir } from "@/lib/facets";
import { formatBytes, formatNumber, plural, relativeTime } from "@/lib/format";
import { languageName } from "@/lib/languages";
import { NO_GROUP } from "@/lib/release-labels";

// What the Analytics page works out from /api/analytics, per library
// (movies, shows): the overview's tiles, the share chart's pieces, and the
// file list's filter menu and requests (the server searches, filters and
// pages the files). No React here, so it's tested on its own
// (logic.test.ts).

type Stats = LibraryAnalytics;

// What a title is in each library.
const UNIT: Record<Library, { titles: string; title: string }> = {
  movies: { titles: "Movies", title: "movie" },
  shows: { titles: "Shows", title: "show" },
};

type Tile = { label: string; value: string; hint: string };

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
      hint: `named in ${percent}\u202f% of files`,
    },
  ];
}

export function subtitle(data: AnalyticsResponse | null): string {
  if (!data) return "Loading…";
  return `From the Jellyfin sync ${relativeTime(data.syncedAt)}`;
}

// ---- The share chart

// What a chart splits the files by, "" standing for files without a
// group, an unknown resolution or codec, or no language tagged.
type Dimension = "groups" | "resolutions" | "codecs" | "languages";

// Every ring's colors, in this order: its pieces with the most files
// first. The theme's chart colors (globals.css: blue, peach, green, the
// accent, yellow), picked to alternate cool and warm so neighbors differ
// in hue and lightness; red stays out (it means missing). The legend names
// every piece, so the colors never carry meaning alone. What's folded into
// "other" and what's unknown in two grays.
export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const OTHER_COLOR = "var(--chart-other)";
const NONE_COLOR = "var(--chart-none)";

// A part of the share chart. Files, not titles: every file has exactly one
// group, resolution and codec (or none), so the parts add up to the whole.
export type Segment = {
  key: string;
  label: string;
  files: number;
  size: number;
  color: string;
  muted: boolean;
};

const sum = (parts: FilePart[]) =>
  parts.reduce((t, p) => ({ files: t.files + p.files, size: t.size + p.size }), { files: 0, size: 0 });

// The parts (most files first, as /api/analytics sends them) in the
// series colors, the rest folded into one "N others" piece, and the
// unknown one ("") last.
function segmentsOf(dimension: Dimension, parts: FilePart[], none: string): Segment[] {
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
  }));
  if (rest.length) {
    segments.push({
      key: `${dimension}-other`,
      label: plural(rest.length, "other"),
      ...sum(rest),
      color: OTHER_COLOR,
      muted: true,
    });
  }
  if (unknown?.files) {
    segments.push({
      key: `${dimension}-none`,
      label: none,
      files: unknown.files,
      size: unknown.size,
      color: NONE_COLOR,
      muted: true,
    });
  }
  return segments;
}

const groupParts = (m: Stats): FilePart[] => m.groups.map((g) => ({ ...g, value: g.value ?? "" }));

export const groupSegments = (m: Stats) => segmentsOf("groups", groupParts(m), NO_GROUP);
export const resolutionSegments = (m: Stats) => segmentsOf("resolutions", m.resolutions, "Unknown");
export const codecSegments = (m: Stats) => segmentsOf("codecs", m.codecs, "Unknown");

// The audio languages' rings: German, English and Spanish, always in that
// order and color, those the library has. A file can have several, so
// there's no "other" piece (it would count files twice).
const LANGUAGE_RINGS = ["DE", "EN", "ES"];
export function languageSegments(m: Stats): Segment[] {
  return LANGUAGE_RINGS.flatMap((code, i): Segment[] => {
    const p = m.languages.find((l) => l.value === code);
    if (!p?.files) return [];
    return [
      {
        key: `languages:${code}`,
        label: languageName(code),
        files: p.files,
        size: p.size,
        color: SERIES_COLORS[i],
        muted: false,
      },
    ];
  });
}

// Always one decimal ("58.3 %"); a sliver is at least 0.1 % and all but
// a sliver at most 99.9 %, so neither reads as none or all. A narrow space
// before the sign, as before a size's unit.
export function percent(part: number, total: number): string {
  const share = total && part ? (part / total) * 100 : 0;
  let p = Math.round(share * 10) / 10;
  if (part > 0 && p === 0) p = 0.1;
  if (part < total && p === 100) p = 99.9;
  return `${formatNumber(p, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}\u202f%`;
}

// ---- The file list

export const FILE_SORTS = [
  { key: "title", label: "Title", defaultDir: "asc" },
  { key: "size", label: "Size", defaultDir: "desc" },
] as const;
export type FileSortKey = (typeof FILE_SORTS)[number]["key"];

// The /api/analytics/files request for one page of a library's list.
export function filesUrl(
  library: Library,
  query: string,
  sortKey: FileSortKey,
  sortDir: SortDir,
  offset: number,
): string {
  const qs = new URLSearchParams({ library, q: query.trim(), sort: sortKey, dir: sortDir, offset: String(offset) });
  return "/api/analytics/files?" + qs;
}

// "1–50 of 649 files", "No files".
export function pageText(offset: number, shown: number, matched: number): string {
  if (!matched) return "No files";
  return `${formatNumber(offset + 1)}–${formatNumber(offset + shown)} of ${plural(matched, "file")}`;
}
