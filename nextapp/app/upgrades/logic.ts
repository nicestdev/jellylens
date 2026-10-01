import type { Alternative, UpgradesResponse, Tier, Unit } from "@/lib/api-types";
import type { SortDir } from "@/lib/facets";
import { formatBytes, formatNumber, plural, seasonLabel } from "@/lib/format";
import { audioOf, codecOf, episodesOf, tierOfRelease } from "@/lib/upgrades";
import { fold } from "@/lib/text";

// What the Upgrades page works out from /api/upgrades: for a group you'd
// like more of, which of your movies or seasons it has released and what
// that would cost in storage. No React here, so it's tested on its own.

export type Library = "movies" | "shows";

// What a movie or a season is called in counts.
export const UNIT: Record<Library, { one: string; title: string }> = {
  movies: { one: "movie", title: "Movies" },
  shows: { one: "season", title: "Seasons" },
};

const key = (group: string | null) => group?.toLowerCase() ?? "";
const NO_GROUP = "n/a";
export const groupName = (g: string | null) => g || NO_GROUP;

// ---- Which release a group offers

// The quality a release should have: the file's own ("same"), any (the
// file's if there, else the best), or one in particular.
export type QualityPick = "same" | "any" | Exclude<Tier, "" | "SD">;
export const QUALITY_PICKS: { key: QualityPick; label: string }[] = [
  { key: "same", label: "Same as now" },
  { key: "any", label: "Any" },
  { key: "2160p", label: "2160p" },
  { key: "1080p", label: "1080p" },
  { key: "720p", label: "720p" },
];
const TIER_ORDER: Tier[] = ["2160p", "1080p", "720p", "SD", ""];

// The codec it should have: the file's own, any (the file's first, if the
// group has both), or one in particular.
export type CodecPick = "same" | "any" | "x264" | "x265";
export const CODEC_PICKS: { key: CodecPick; label: string }[] = [
  { key: "same", label: "Same as now" },
  { key: "any", label: "Any" },
  { key: "x264", label: "x264" },
  { key: "x265", label: "x265" },
];

// A group's release of a unit in that quality and codec: a season's pack
// before its episodes one by one, the file's codec first, then the
// newest. others: how many more it has like that (a remux, the other
// codec).
export function pickAlternative(
  u: Unit,
  group: string,
  quality: QualityPick,
  codec: CodecPick = "any"
): { alt: Alternative; others: number } | null {
  const wanted = codec === "same" ? u.codec : codec;
  const ofGroup = u.alternatives.filter((a) => key(a.group) === key(group) && (wanted === "any" || a.codec === wanted));
  let tier: Tier | undefined;
  if (quality === "same") tier = u.tier;
  else if (quality === "any") {
    const tiers = new Set(ofGroup.map((a) => a.tier));
    tier = tiers.has(u.tier) ? u.tier : TIER_ORDER.find((t) => tiers.has(t));
  } else tier = quality;
  const matching = ofGroup
    .filter((a) => a.tier === tier)
    .sort(
      (a, b) =>
        Number(b.pack) - Number(a.pack) ||
        Number(b.codec === u.codec) - Number(a.codec === u.codec) ||
        b.publishedAt - a.publishedAt
    );
  return matching.length ? { alt: matching[0], others: matching.length - 1 } : null;
}

// What a file has as a release would name it: DL or ML by its name, else
// by its audio (German and one more language is DL, more than that ML);
// null: neither.
export function fileAudio(u: Unit): "DL" | "ML" | null {
  const named = audioOf(u.fileName);
  if (named) return named;
  if (!u.languages.includes("DE")) return null;
  const others = u.languages.length - 1;
  return others >= 2 ? "ML" : others === 1 ? "DL" : null;
}

// ---- What changes

// Group, quality, codec and audio of the file and of the release, each
// with whether it stays the same. Audio: "DE" for German only, else DL or
// ML ("?" for a file with none tagged).
export type Attribute = { key: "group" | "quality" | "codec" | "audio"; before: string; after: string; same: boolean };

export function attributes(u: Unit, alt: Alternative): Attribute[] {
  const audio = fileAudio(u) ?? (u.languages.length ? u.languages.join("+") : "?");
  const pairs: [Attribute["key"], string, string][] = [
    ["group", groupName(u.groups[0]?.name ?? null), alt.group],
    ["quality", u.tier || "?", alt.tier || "?"],
    ["codec", u.codec || "?", alt.codec || "?"],
    ["audio", audio, alt.audio ?? "DE"],
  ];
  return pairs.map(([key, before, after]) => ({ key, before, after, same: before.toLowerCase() === after.toLowerCase() }));
}

// A file has one language only, and the release is DL or ML.
export const addsAudio = (u: Unit, alt: Alternative) => u.languages.length < 2 && alt.audio !== null;

// Bytes more (or, negative, less) the release takes than the files; null
// if xREL gave no size.
export const sizeChange = (u: Unit, alt: Alternative) => (alt.size === null ? null : alt.size - u.size);

// "+2,30 GB", "−1,10 GB", "±0 B"; "?" without a size.
export function formatChange(bytes: number | null): string {
  if (bytes === null) return "?";
  if (bytes === 0) return "±0 B";
  return (bytes > 0 ? "+" : "−") + formatBytes(Math.abs(bytes));
}

// ---- Switch to a group

// target: the group you'd like more of; from (Source): only units whose main group
// is one of these (keys, lowercased; "" none named; empty: any);
// onlyAudio: only releases that add a language.
export type SwitchOptions = {
  target: string;
  from: Set<string>;
  quality: QualityPick;
  codec: CodecPick;
  onlyAudio: boolean;
};

export type SwitchRow = {
  unit: Unit;
  alt: Alternative;
  others: number;
  change: number | null;
  addsAudio: boolean;
};

export type SwitchSummary = {
  rows: SwitchRow[];
  considered: number; // units not all from the target, after "from"
  audio: number; // rows that add a language
  added: number; // bytes the releases take (those with a size)
  removed: number; // bytes the files they'd replace take
  unknown: number; // rows without a size
  shareNow: number; // the target's files out of all, 0–1
  shareAfter: number;
};

const fromTarget = (u: Unit, target: string) => u.groups.filter((g) => key(g.name) === key(target)).reduce((s, g) => s + g.files, 0);

export function switchSummary(units: Unit[], o: SwitchOptions): SwitchSummary {
  const total = units.reduce((s, u) => s + u.files, 0);
  const owned = units.reduce((s, u) => s + fromTarget(u, o.target), 0);
  const considered = units.filter(
    (u) => fromTarget(u, o.target) < u.files && (!o.from.size || o.from.has(key(u.groups[0]?.name ?? null)))
  );
  const rows: SwitchRow[] = [];
  for (const unit of considered) {
    const pick = pickAlternative(unit, o.target, o.quality, o.codec);
    if (!pick) continue;
    const audio = addsAudio(unit, pick.alt);
    if (o.onlyAudio && !audio) continue;
    rows.push({ unit, alt: pick.alt, others: pick.others, change: sizeChange(unit, pick.alt), addsAudio: audio });
  }
  const sized = rows.filter((r) => r.alt.size !== null);
  const switched = rows.reduce((s, r) => s + r.unit.files - fromTarget(r.unit, o.target), 0);
  return {
    rows,
    considered: considered.length,
    audio: rows.filter((r) => r.addsAudio).length,
    added: sized.reduce((s, r) => s + r.alt.size!, 0),
    removed: sized.reduce((s, r) => s + r.unit.size, 0),
    unknown: rows.length - sized.length,
    shareNow: total ? owned / total : 0,
    shareAfter: total ? (owned + switched) / total : 0,
  };
}

export type Tile = { label: string; value: string; hint: string; muted?: boolean; tone?: "good" | "bad" };

const pct = (share: number) => `${Math.round(share * 100)} %`;

export function switchTiles(s: SwitchSummary, o: SwitchOptions, library: Library): Tile[] {
  const unit = UNIT[library].one;
  const change = s.added - s.removed;
  return [
    {
      label: `${o.target} has`,
      value: formatNumber(s.rows.length),
      hint: `of ${plural(s.considered, unit)} from other groups`,
      muted: !s.rows.length,
    },
    {
      label: "Original audio",
      value: formatNumber(s.audio),
      hint: "German only now, DL or ML then",
      muted: !s.audio,
    },
    {
      label: "Storage",
      value: s.rows.length - s.unknown ? formatChange(change) : "–",
      hint: s.unknown ? `${plural(s.unknown, unit)} without a size` : `${formatBytes(s.added)} for ${formatBytes(s.removed)}`,
      muted: !s.rows.length,
      tone: change < 0 ? "good" : change > 0 ? "bad" : undefined,
    },
    {
      label: `${o.target}'s share`,
      value: `${pct(s.shareNow)} → ${pct(s.shareAfter)}`,
      hint: library === "movies" ? "of the movie files" : "of the episode files",
    },
  ];
}

// ---- The list

export const SWITCH_SORTS = [
  { key: "title", label: "Title", defaultDir: "asc" },
  { key: "change", label: "Storage change", defaultDir: "asc" },
  { key: "size", label: "Release size", defaultDir: "desc" },
] as const;
export type SwitchSortKey = (typeof SWITCH_SORTS)[number]["key"];

// Rows without a size go last, whichever way it's sorted.
export function sortRows(rows: SwitchRow[], sortKey: SwitchSortKey, dir: SortDir): SwitchRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const byTitle = (a: SwitchRow, b: SwitchRow) =>
    a.unit.title.localeCompare(b.unit.title) || (a.unit.season ?? 0) - (b.unit.season ?? 0);
  const value = (r: SwitchRow) => (sortKey === "change" ? r.change : r.alt.size);
  return [...rows].sort((a, b) => {
    if (sortKey === "title") return sign * byTitle(a, b);
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) return (va === null ? 1 : 0) - (vb === null ? 1 : 0) || byTitle(a, b);
    return sign * (va - vb) || byTitle(a, b);
  });
}

// Every word in the title.
export function searchRows<T extends { unit: Unit }>(rows: T[], query: string): T[] {
  const words = fold(query).split(" ").filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const title = fold(r.unit.title);
    return words.every((w) => title.includes(w));
  });
}

// The Source filter's values: the library's groups other than the target,
// most files first, none named last.
export function fromFacet(data: Pick<UpgradesResponse, "groups">, target: string) {
  const parts = data.groups.filter((g) => key(g.value) !== key(target));
  const sorted = [...parts.filter((g) => g.value !== null), ...parts.filter((g) => g.value === null)];
  return {
    values: sorted.map((g) => key(g.value)),
    counts: new Map(sorted.map((g) => [key(g.value), g.files])),
    names: new Map(sorted.map((g) => [key(g.value), groupName(g.value)])),
  };
}

// The group menu, A→Z.
export const targetGroups = (favorites: string[]) =>
  [...favorites].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

// What the page starts with: the target group, quality and codec picked
// last (saved, as read back from storage: anything), each only if it's
// still one to pick; else the top group, the file's own quality and any
// codec.
export type Choices = { target: string; quality: QualityPick; codec: CodecPick };
export function startChoices(groups: string[], saved: unknown): Choices {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  return {
    target: groups.find((g) => g === s.target) ?? groups[0] ?? "",
    quality: QUALITY_PICKS.find((q) => q.key === s.quality)?.key ?? "same",
    codec: CODEC_PICKS.find((c) => c.key === s.codec)?.key ?? "any",
  };
}

// The release panel for a row's title (components/release-panel.tsx),
// listing only what the filters allow: the target group's releases, in
// the quality and codec picked (the file's own for "same as now", all for
// "any"), and a season's only those of that season.
export function panelFor(u: Unit, o: Pick<SwitchOptions, "target" | "quality" | "codec">, library: Library) {
  const mediaType = library === "movies" ? ("movie" as const) : ("tv" as const);
  const season = u.season;
  const tier = o.quality === "any" ? null : o.quality === "same" ? u.tier : o.quality;
  const codec = o.codec === "any" ? null : o.codec === "same" ? u.codec : o.codec;
  const kind = [tier, codec].filter(Boolean).join(" ");
  return {
    title: {
      key: `${mediaType}:${u.tmdbId}`,
      title: u.title,
      year: u.year,
      posterPath: null,
      mediaType,
      tmdbId: u.tmdbId,
      library: { id: u.parentId, imageTag: u.imageTag },
    },
    only: {
      keep: (r: { group: string; name: string; quality: string }) =>
        key(r.group) === key(o.target) &&
        (tier === null || tierOfRelease(r.quality) === tier) &&
        (codec === null || codecOf(r.name) === codec) &&
        (season === null || episodesOf(r.name)?.season === season),
      note: `Only ${o.target}'s ${kind ? kind + " " : ""}releases${season === null ? "" : ` of ${seasonLabel(season)}`}`,
    },
  };
}
export type PanelFor = ReturnType<typeof panelFor>;
