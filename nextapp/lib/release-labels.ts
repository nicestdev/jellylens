import type { MatchInfo, TitleRelease } from "./api-types";
import { plural } from "./format";
import { audioOf, episodesOf } from "./upgrades";

// How xREL releases and their matches read, on the Releases page's tiles
// and on a title's page (components/title-view.tsx).

// A file or release without a group, wherever it's named.
export const NO_GROUP = "n/a";

// xREL's category ("HD-1080p") as shown ("1080p").
export const qualityLabel = (v: string) => v.replace(/^HD-/, "");

// "2010 · 3 releases" under a Releases poster. releases: left out while
// it isn't known.
export const titleMeta = (t: { year: number | null; releases?: number }) =>
  [t.year, t.releases === undefined ? null : plural(t.releases, "release")].filter(Boolean).join(" · ");

// The one badge for the favorite groups that have released a title
// (Requests, Missing), A→Z: "VECTOR", "FuN +2"; hovered, all of them.
export const releasedLabel = (groups: string[]) =>
  groups.length > 1 ? `${groups[0]} +${groups.length - 1}` : (groups[0] ?? "");
export const releasedHint = (groups: string[]) => `Released by ${groups.join(", ")}`;

// Why the tile shows what it shows, when that isn't simply xREL's match.
export function matchNote(match: MatchInfo): string | null {
  switch (match.status) {
    case "searched":
      return "Found on TMDB by its release name; xREL linked it to something else.";
    case "unverified":
      return match.candidate
        ? "Not matched: xREL's link doesn't fit the release name."
        : "Not matched: TMDB doesn't know this title.";
    case "confirmed":
      return "xREL's match, confirmed by you.";
    case "rejected":
      return "Marked as a wrong match by you.";
    default:
      return null;
  }
}

const withYear = (t: { title: string; year: number | null }) => (t.year ? `${t.title} (${t.year})` : t.title);

// A title's ⋯ menu for fixing a match by hand: drop TMDB's data, take
// xREL's link after all, or go back to the automatic check.
export function matchActions(match: MatchInfo): { label: string; verdict: MatchInfo["verdict"] }[] {
  const actions: { label: string; verdict: MatchInfo["verdict"] }[] = [];
  if (match.status === "verified" || match.status === "searched") {
    actions.push({ label: "Wrong match", verdict: "wrong" });
  }
  if ((match.status === "unverified" || match.status === "rejected") && match.candidate) {
    actions.push({ label: `Use xREL's match: ${withYear(match.candidate)}`, verdict: "xrel" });
  }
  if (match.verdict) actions.push({ label: "Match automatically", verdict: null });
  return actions;
}

// A show's single episodes, one entry per season, group and version, as
// a title's page lists them: "Show.S01E01.German.1080p.WEB-GRP" and its E02 are
// "Show.S01.German.1080p.WEB-GRP · 2 episodes". The entry keeps the newest
// one's id, link and date (the list is newest first); a lone episode stays
// as it is, like season packs, movies and anything else.
export function groupEpisodes(items: TitleRelease[]): TitleRelease[] {
  const out: (TitleRelease | { name: string; releases: TitleRelease[]; episodes: Set<number> })[] = [];
  const seasons = new Map<string, { name: string; releases: TitleRelease[]; episodes: Set<number> }>();
  for (const r of items) {
    const episodes = episodesOf(r.name)?.episodes;
    if (!episodes) {
      out.push(r);
      continue;
    }
    const name = r.name.replace(/(\.S\d{1,2})E\d{1,3}(?:-?E\d{1,3})?(?=\.)/i, "$1");
    const key = r.group + "\n" + name.toLowerCase();
    let season = seasons.get(key);
    if (!season) {
      season = { name, releases: [], episodes: new Set() };
      seasons.set(key, season);
      out.push(season);
    }
    season.releases.push(r);
    for (const e of episodes) season.episodes.add(e);
  }
  return out.map((e) =>
    !("releases" in e)
      ? e
      : e.releases.length === 1
        ? e.releases[0]
        : {
            ...e.releases[0],
            name: e.name,
            episodes: e.episodes.size,
            // All of them together, if xREL gave each one's.
            sizeMb: e.releases.every((r) => r.sizeMb !== null)
              ? e.releases.reduce((n, r) => n + (r.sizeMb ?? 0), 0)
              : null,
          },
  );
}

// The resolution a release name says ("2160p"), else its xREL category's
// ("HD-1080p"), "SD" for the SD ones ("x264-SD", "XviD"); null: neither
// says. For a title page's quality switch, xREL's and WCX's alike.
export function resolutionOf(name: string, quality?: string | null): string | null {
  const res = /\b(2160p|1080p|720p|576p|480p)\b/i.exec(name)?.[1] ?? /(2160p|1080p|720p)/i.exec(quality ?? "")?.[1];
  if (res) return res.toLowerCase();
  return /SD$|XviD/i.test(quality ?? "") ? "SD" : null;
}

// The seasons a release name holds: "S02" or "S02E05" → [2, 2],
// "S01-S03", "S01+S02", "S01-03" → [1, 3]; null if it names none.
export function seasonsOf(name: string): [number, number] | null {
  const m = /\.S(\d{1,2})(?:E\d{1,3})?(?:[+-]S?(\d{1,2}))?(?=[.+-])/i.exec(name);
  if (!m) return null;
  const from = Number(m[1]);
  return [from, m[2] ? Math.max(from, Number(m[2])) : from];
}

// A release's name without the title the row shows above it: what comes
// after a show's "S01" or "S01E02", or after a movie's year (the last one
// before the first tag, so "Blade.Runner.2049.2017" loses 2017 too). The
// whole name if it has neither. keepEpisode: a show's from its "S01" on
// (a title page lists every season's).
const FIRST_TAG =
  /[._ -](german|english|dl|ml|2160p|1080p|720p|576p|480p|uhd|web|web-?dl|webrip|bluray|hdtv)(?=[._ -])/i;

export function withoutTitle(name: string, { keepEpisode = false } = {}): string {
  const show = /^(.*?[._ -])(S\d{1,2}(?:E\d{1,3}(?:-?E\d{1,3})?)?[._ -])/i.exec(name);
  if (show) return name.slice(show[1].length + (keepEpisode ? 0 : show[2].length)) || name;
  const end = FIRST_TAG.exec(name)?.index ?? name.length;
  const year = [...name.slice(0, end).matchAll(/[._ ](?:19|20)\d{2}(?=[._ ]|$)/g)].at(-1);
  return (year && name.slice(year.index + year[0].length + 1)) || name;
}

// A library copy as a release's line under its name reads: group,
// quality, codec, DL/ML (from the file's name), for the in-library
// icon's tooltip.
export const copyLabel = (c: { fileName: string; group: string | null; resolution: string; codec: string }) =>
  [c.group, c.resolution, c.codec, audioOf(c.fileName)].filter(Boolean).join(" · ") || "unknown quality";

// Whether a library file is from this very release, not just the same
// title: its name (any case, dots, spaces or underscores alike, without
// the extension) is the release's; for a show, the part before its
// "S01E02" is the release's before "S01" (a pack's "S01-S03" too), and it
// ends the way the release does after that, an episode's title in
// between ("Show.S04E01.Die.neue.Welt.GERMAN.1080p-GRP" is from
// "Show.S04.GERMAN.1080p-GRP").
const plainName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.(mkv|mp4|m4v|avi|ts|wmv)$/, "")
    .replace(/[\s._]+/g, ".");

export function fromRelease(fileName: string, release: string): boolean {
  const file = plainName(fileName);
  const rel = plainName(release);
  if (file === rel) return true;
  const r = /^(.+?)\.s\d{1,2}(?:e\d{1,3}(?:-?e\d{1,3})*)?(?:[+-]s?\d{1,2})*\.(.+)$/.exec(rel);
  const f = /^(.+?)\.s\d{1,2}e\d{1,3}(?:-?e\d{1,3})*\.(.+)$/.exec(file);
  return !!r && !!f && r[1] === f[1] && (f[2] === r[2] || f[2].endsWith("." + r[2]));
}
