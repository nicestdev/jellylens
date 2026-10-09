// What the Upgrades page compares: each owned movie, and each season of
// an owned show, with the favorite groups' releases of it (xREL). Worked
// out per request from media_files and the releases (lib/store/upgrades.ts
// reads them); the page then picks a group and a quality and adds it up
// (app/upgrades/logic.ts).

import { MB } from "./format";

// A file's or release's quality, by the same names: xREL's "HD-1080p" and
// Jellyfin's "1080p" are both "1080p", "4K" and "HD-2160p" are "2160p".
// Below 720p is all "SD"; "" is unknown.
export type Tier = "2160p" | "1080p" | "720p" | "SD" | "";
export const TIERS: Exclude<Tier, "">[] = ["2160p", "1080p", "720p", "SD"];

export function tierOfRelease(quality: string): Tier {
  const m = /^HD-(2160p|1080p|720p)$/.exec(quality);
  return m ? (m[1] as Tier) : quality ? "SD" : "";
}
export const tierOfFile = (resolution: string): Tier => (resolution === "4K" ? "2160p" : (resolution as Tier));

// A release's video codec by its name, as Analytics labels a file's
// (codecLabel in lib/analytics.ts): x264 for any H.264, x265 for H.265;
// "" if the name doesn't say.
export function codecOf(name: string): string {
  if (/[.-]([xh]\.?265|hevc)[.-]/i.test(name)) return "x265";
  if (/[.-]([xh]\.?264|avc)[.-]/i.test(name)) return "x264";
  if (/[.-]av1[.-]/i.test(name)) return "AV1";
  return "";
}

// German plus the original audio (DL, "dual language") or several more
// (ML), by the tag in the release's name; null: German only, as far as
// the name says. "WEB-DL" is a source, not this.
export function audioOf(name: string): "DL" | "ML" | null {
  const m = /\.(DL|ML)\./i.exec(name);
  return m ? (m[1].toUpperCase() as "DL" | "ML") : null;
}

// The season and episodes a show's release has: one episode
// ("S01E02"), two in one ("S01E01E02", "S01E01-E02"), or the whole season
// (a pack, "S01" alone: episodes null). null for anything else, like a
// pack of several seasons ("S01-S03").
export function episodesOf(name: string): { season: number; episodes: number[] | null } | null {
  const ep = /\.S(\d{1,2})E(\d{1,3})(?:-?E(\d{1,3}))?\./i.exec(name);
  if (ep) {
    const first = Number(ep[2]);
    const last = ep[3] ? Number(ep[3]) : first;
    return {
      season: Number(ep[1]),
      episodes: Array.from({ length: Math.max(1, last - first + 1) }, (_, i) => first + i),
    };
  }
  const pack = /\.S(\d{1,2})\./i.exec(name);
  return pack ? { season: Number(pack[1]), episodes: null } : null;
}

// One of the library's files, as media_files has it. imageTag: the movie's
// or show's poster in Jellyfin.
export type OwnedFile = {
  parentId: string;
  title: string;
  year: number | null;
  tmdbId: string | null;
  imageTag: string | null;
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  fileName: string;
  size: number;
  group: string | null;
  resolution: string;
  codec: string;
  languages: string[];
};

// A favorite group's release of an owned movie or show (by its TMDB id,
// from title_matches). sizeMb: null if xREL gave none.
export type GroupRelease = {
  tmdbId: number;
  group: string;
  name: string;
  quality: string;
  sizeMb: number | null;
  publishedAt: number;
};

// What a group has of a unit, in one quality and codec. A movie: one
// release (a movie can have several per group and quality: a remux, a
// REPACK). A season: its pack, or the episodes the library has, one
// release each (episodes: how many). name: the release's (the first
// episode's); the title page links to xREL. size: bytes, null if xREL
// didn't say for one of them.
export type Alternative = {
  group: string;
  tier: Tier;
  codec: string;
  name: string;
  size: number | null;
  audio: "DL" | "ML" | null;
  pack: boolean;
  episodes: number;
  publishedAt: number;
};

// An owned movie, or one season of a show (key "<show id>:<season>"),
// with its files: their groups (most files first; null: none named),
// quality (the most files'), the audio languages every one of them has,
// and what the favorite groups have of it. fileName: the first file's (a
// season's first episode).
export type Unit = {
  key: string;
  parentId: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  imageTag: string | null;
  season: number | null;
  fileName: string;
  files: number;
  size: number;
  groups: { name: string | null; files: number }[];
  tier: Tier;
  codec: string;
  languages: string[];
  alternatives: Alternative[];
};

function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

// A group's spelling as the library first has it ("FuN", "FUN" are one).
function groupsOf(files: OwnedFile[]): Unit["groups"] {
  const byKey = new Map<string, { name: string | null; files: number }>();
  for (const f of files) {
    const key = f.group?.toLowerCase() ?? "";
    const g = byKey.get(key) ?? { name: f.group, files: 0 };
    g.files++;
    byKey.set(key, g);
  }
  return [...byKey.values()].sort((a, b) => b.files - a.files);
}

function unitOf(key: string, files: OwnedFile[], season: number | null, alternatives: Alternative[]): Unit {
  const f = files[0];
  const tmdbId = f.tmdbId ? Number(f.tmdbId) : null;
  return {
    key,
    parentId: f.parentId,
    title: f.title,
    year: f.year,
    tmdbId: Number.isFinite(tmdbId) ? tmdbId : null,
    imageTag: f.imageTag,
    season,
    fileName: f.fileName,
    files: files.length,
    size: files.reduce((sum, x) => sum + x.size, 0),
    groups: groupsOf(files),
    tier: mostCommon(files.map((x) => tierOfFile(x.resolution))),
    codec: mostCommon(files.map((x) => x.codec)),
    languages: f.languages.filter((l) => files.every((x) => x.languages.includes(l))),
    alternatives,
  };
}

const byTmdb = (releases: GroupRelease[]) => {
  const map = new Map<number, GroupRelease[]>();
  for (const r of releases) map.set(r.tmdbId, [...(map.get(r.tmdbId) ?? []), r]);
  return map;
};

const bytes = (sizeMb: number | null) => (sizeMb ? sizeMb * MB : null);

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}

// Every owned movie, with every favorite group's release of it.
export function movieUnits(files: OwnedFile[], releases: GroupRelease[]): Unit[] {
  const released = byTmdb(releases);
  return [...groupBy(files, (f) => f.parentId)].map(([key, own]) => {
    const tmdbId = Number(own[0].tmdbId);
    const alternatives = (released.get(tmdbId) ?? []).map((r): Alternative => ({
      group: r.group,
      tier: tierOfRelease(r.quality),
      codec: codecOf(r.name),
      name: r.name,
      size: bytes(r.sizeMb),
      audio: audioOf(r.name),
      pack: false,
      episodes: 1,
      publishedAt: r.publishedAt,
    }));
    return unitOf(key, own, null, alternatives);
  });
}

// The episodes a season's files hold ("S01E01-E02" is two).
function ownedEpisodes(files: OwnedFile[]): Set<number> | null {
  const owned = new Set<number>();
  for (const f of files) {
    if (f.episode == null) return null;
    for (let e = f.episode; e <= Math.max(f.episode, f.episodeEnd ?? f.episode); e++) owned.add(e);
  }
  return owned;
}

// What one group has of a season in one quality and codec: its newest pack, and the
// owned episodes released one by one if it has all of them (the newest
// release of each). A group with only some of them has nothing to offer.
function seasonAlternatives(
  group: string,
  tier: Tier,
  codec: string,
  releases: GroupRelease[],
  owned: Set<number> | null,
): Alternative[] {
  const newestFirst = [...releases].sort((a, b) => b.publishedAt - a.publishedAt);
  const out: Alternative[] = [];
  const pack = newestFirst.find((r) => episodesOf(r.name)?.episodes === null);
  if (pack) {
    out.push({
      group,
      tier,
      codec,
      name: pack.name,
      size: bytes(pack.sizeMb),
      audio: audioOf(pack.name),
      pack: true,
      episodes: owned?.size ?? 0,
      publishedAt: pack.publishedAt,
    });
  }
  if (owned?.size) {
    const byEpisode = new Map<number, GroupRelease>();
    for (const r of newestFirst) {
      for (const e of episodesOf(r.name)?.episodes ?? []) if (owned.has(e) && !byEpisode.has(e)) byEpisode.set(e, r);
    }
    if (byEpisode.size === owned.size) {
      const picked = [...new Set(byEpisode.values())];
      const first = picked.sort((a, b) => a.name.localeCompare(b.name))[0];
      out.push({
        group,
        tier,
        codec,
        name: first.name,
        size: picked.every((r) => r.sizeMb) ? picked.reduce((sum, r) => sum + r.sizeMb! * MB, 0) : null,
        audio: audioOf(first.name),
        pack: false,
        episodes: owned.size,
        publishedAt: Math.max(...picked.map((r) => r.publishedAt)),
      });
    }
  }
  return out;
}

// Every season of every owned show (specials too, though groups seldom
// release those), with what each favorite group has of it.
export function seasonUnits(files: OwnedFile[], releases: GroupRelease[]): Unit[] {
  const released = byTmdb(releases);
  return [...groupBy(files, (f) => `${f.parentId}:${f.season ?? ""}`)].map(([key, own]) => {
    const season = own[0].season;
    const owned = ownedEpisodes(own);
    const ofSeason = (released.get(Number(own[0].tmdbId)) ?? []).filter((r) => episodesOf(r.name)?.season === season);
    const alternatives = [
      ...groupBy(ofSeason, (r) => [r.group, tierOfRelease(r.quality), codecOf(r.name)].join("\n")),
    ].flatMap(([, rs]) =>
      seasonAlternatives(rs[0].group, tierOfRelease(rs[0].quality), codecOf(rs[0].name), rs, owned),
    );
    return unitOf(key, own, season, alternatives);
  });
}
