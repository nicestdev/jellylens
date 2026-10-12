import type { AnalyticsResponse, AudioMix, FilePart } from "@/lib/api-types";
import { formatBytes, formatNumber, plural } from "@/lib/format";
import { NO_GROUP } from "@/lib/release-labels";

// What the Analytics page works out from /api/analytics, over both
// libraries: the tiles and the charts' rows. No React here, so it's tested
// on its own (logic.test.ts).

type Tile = { label: string; value: string; hint: string[] };

const hours = (seconds: number) => `${formatNumber(Math.round(seconds / 3600))} h`;

export function overviewTiles(a: AnalyticsResponse): Tile[] {
  const { movies, shows } = a;
  return [
    {
      label: "Storage",
      value: formatBytes(movies.size + shows.size),
      hint: [`${formatBytes(movies.size)} movies`, `${formatBytes(shows.size)} shows`],
    },
    { label: "Movies", value: formatNumber(movies.titles), hint: [`${hours(movies.seconds)} runtime`] },
    {
      label: "Shows",
      value: formatNumber(shows.titles),
      hint: [plural(shows.files, "episode"), `${hours(shows.seconds)} runtime`],
    },
  ];
}

// A table's row; total: all the table's bytes, for its share.
export type Row = { key: string; label: string; movies: number; episodes: number; size: number; total: number };

function rowsOf<V>(parts: FilePart<V>[], label: (p: FilePart<V>) => string): Row[] {
  const total = parts.reduce((n, p) => n + p.size, 0);
  return parts.map((p) => ({
    key: String(p.value ?? ""),
    label: label(p),
    movies: p.movies,
    episodes: p.episodes,
    size: p.size,
    total,
  }));
}

// Best first, unknown last; any other label after the known ones.
const RESOLUTIONS = ["4K", "1080p", "720p", "SD"];
const rank = (value: string) => (value === "" ? 99 : RESOLUTIONS.indexOf(value) + 1 || 50);

export const resolutionRows = (a: AnalyticsResponse) =>
  rowsOf(
    [...a.resolutions].sort((x, y) => rank(x.value) - rank(y.value)),
    (p) => p.value || "Unknown",
  );

// Largest first (as sent), unknown last.
export const codecRows = (a: AnalyticsResponse) =>
  rowsOf(
    [...a.codecs].sort((x, y) => Number(x.value === "") - Number(y.value === "")),
    (p) => p.value || "Unknown",
  );

const AUDIO_LABELS: Record<AudioMix, string> = {
  "DE+EN": "German & English",
  DE: "German only",
  EN: "English only",
  other: "Other",
  "": "Not tagged",
};
const AUDIO_ORDER = Object.keys(AUDIO_LABELS);

// Both first, as that's the aim; then one, neither, none tagged.
export const audioRows = (a: AnalyticsResponse) =>
  rowsOf(
    [...a.audio].sort((x, y) => AUDIO_ORDER.indexOf(x.value) - AUDIO_ORDER.indexOf(y.value)),
    (p) => AUDIO_LABELS[p.value],
  );

// The largest groups by name; the rest folded into one row, then the files
// without a group.
const TOP_GROUPS = 10;

export function groupRows(a: AnalyticsResponse): Row[] {
  const named = a.groups.filter((g) => g.value !== null);
  const rest = named.slice(TOP_GROUPS);
  const none = a.groups.filter((g) => g.value === null);
  const others: FilePart<string | null>[] = rest.length
    ? [
        rest.reduce(
          (o, g) => ({ ...o, movies: o.movies + g.movies, episodes: o.episodes + g.episodes, size: o.size + g.size }),
          {
            value: "\0others",
            movies: 0,
            episodes: 0,
            size: 0,
          },
        ),
      ]
    : [];
  return rowsOf([...named.slice(0, TOP_GROUPS), ...others, ...none], (p) =>
    p.value === null ? NO_GROUP : p.value === "\0others" ? plural(rest.length, "other") : p.value,
  );
}

// Always one decimal ("58.3 %"); a sliver is at least 0.1 % and all but
// a sliver at most 99.9 %, so neither reads as none or all. A narrow space
// before the sign, as before a size's unit.
export function percent(part: number, total: number): string {
  const share = total && part ? (part / total) * 100 : 0;
  let p = Math.round(share * 10) / 10;
  if (part > 0 && p === 0) p = 0.1;
  if (part < total && p === 100) p = 99.9;
  return `${formatNumber(p, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
