import { MB, seasonCode } from "../format";
import { dottedName } from "../release-name";
import { DLOAD_URL } from "../env";
import { releaseOf } from "../title-rows";
import { all } from "./sql";
import { dloadUsers } from "./dload";

// Administration › Migrations: what the library has against what a target
// group offers of the same TMDB titles. A DLoad uploader's offers are
// their threads (dload_threads, lib/sync-dload.ts), under the group most
// of them are of; any other favorite group's are its xREL releases whose
// title is matched to TMDB (title_matches).

// dloadUser: the uploader's forum id, for a DLoad target.
export type MigrationTarget = { key: string; name: string; dloadUser?: number };

// A release (or a DLoad thread) of the target: its name and where to look
// at it (DLoad's thread; xREL's page, and FunXD for FuN).
// size: bytes, as xREL says (null: unknown, always for DLoad's threads).
// whole: it's the movie, or exactly the season (not an episode, not a pack
// of several), so its size compares with the library's.
export type MigrationOffer = {
  name: string;
  links: { label: string; href: string }[];
  size: number | null;
  whole: boolean;
};

// A movie, or a season of a show, a target offers, by what the library
// has of it: replace, its files from anyone else; upgrade, the target's own
// WEB files it has a BluRay of. groups: those files' groups (the source),
// the most common first; size and episodes: of those files. have: their
// release names, the most files' first (a season's as "Show.S04.GERMAN…-GRP"),
// each with its files' size and, when they're a DLoad uploader's group's,
// their thread (links: the one named the same, any case, else of their
// resolution, else their newest of it). none: a movie or season with no row of any
// target, all its files, target "" and no offers.
export type MigrationRow = {
  have: { name: string; size: number; links: MigrationOffer["links"] }[];
  kind: "replace" | "upgrade" | "none";
  target: string;
  type: "movie" | "tv";
  tmdbId: number;
  title: string;
  year: number | null;
  season: number | null;
  groups: string[];
  resolution: string;
  size: number;
  episodes: number | null;
  offers: MigrationOffer[];
};

type Offer = MigrationOffer & { type: "movie" | "tv"; tmdbId: number; seasons: number[] };
type FileRow = {
  kind: string;
  tmdbId: string;
  title: string;
  year: number | null;
  season: number | null;
  grp: string | null;
  grpKey: string | null;
  fileName: string;
  resolution: string;
  size: number;
};

// The DLoad uploaders by their group, then the other favorite P2P groups A→Z.
export function migrationTargets(): MigrationTarget[] {
  const dload = dloadUsers().map((u) => ({ key: `dload:${u.id}`, name: u.group, dloadUser: u.id }));
  const taken = new Set(dload.map((t) => t.name.toLowerCase()));
  const groups = all<{ id: string; name: string }>(
    "SELECT id, name FROM release_groups WHERE kind = 'p2p' ORDER BY lower(name)",
  ).filter((g) => !taken.has(g.name.toLowerCase()));
  return [...dload, ...groups.map((g) => ({ key: g.id, name: g.name }))];
}

// A release name's seasons: "S01", "S01E02" (its season), "S01-S03".
export function seasonsOf(name: string): number[] {
  const m = /[.\s]S(\d{1,2})(?:E\d{1,3})*(?:[-+]S?(\d{1,2}))?[.\s]/i.exec(name);
  if (!m) return [];
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  return Array.from({ length: Math.max(1, to - from + 1) }, (_, i) => from + i);
}

const tmdbKey = (type: string, id: number | string) => `${type}:${id}`;
const funxd = (type: string, tmdbId: number, name: string) =>
  `/api/funxd-link?${new URLSearchParams({ tmdbId: tmdbKey(type, tmdbId), title: name })}`;

// A favorite group's xREL releases with a title matched to TMDB.
function xrelOffers(groupId: string, group: string): Offer[] {
  return all<{ name: string; link: string; type: "movie" | "tv"; tmdbId: number; sizeMb: number | null }>(
    `SELECT r.name, r.link, m.media_type AS type, m.tmdb_id AS tmdbId, r.size_mb AS sizeMb FROM releases r
     JOIN title_matches m ON m.title_key = r.title_key
     WHERE r.group_id = ? AND m.tmdb_id IS NOT NULL AND m.status IN ('verified', 'searched', 'confirmed')
     ORDER BY r.published_at DESC`,
    groupId,
  ).map((r) => ({
    type: r.type,
    tmdbId: r.tmdbId,
    seasons: r.type === "tv" ? seasonsOf(r.name) : [],
    name: r.name,
    size: r.sizeMb ? r.sizeMb * MB : null,
    whole: r.type === "movie" || (seasonsOf(r.name).length === 1 && !/[.\s]S\d{1,2}E\d/i.test(r.name)),
    links: [
      { label: "xREL", href: r.link },
      ...(group.toLowerCase() === "fun" ? [{ label: "FunXD", href: funxd(r.type, r.tmdbId, r.name) }] : []),
    ],
  }));
}

// A DLoad uploader's: their threads, and their group's xREL releases when
// it's a favorite group too; one both have (by name, any case) is one offer
// with both links and xREL's size.
function offersOf(target: MigrationTarget): Offer[] {
  if (target.dloadUser === undefined) return xrelOffers(target.key, target.name);
  const threads: Offer[] = all<{ id: number; title: string; type: "movie" | "tv"; tmdbId: number; seasons: string }>(
    `SELECT id, title, type, tmdb_id AS tmdbId, seasons FROM dload_threads
     WHERE user_id = ? AND tmdb_id IS NOT NULL ORDER BY posted_at DESC`,
    target.dloadUser,
  ).map((t) => ({
    type: t.type,
    tmdbId: t.tmdbId,
    seasons: JSON.parse(t.seasons),
    name: dottedName(t.title),
    links: [{ label: "DLoad", href: `${DLOAD_URL}/threads/${t.id}/` }],
    size: null,
    whole: false,
  }));
  const group = all<{ id: string; name: string }>(
    "SELECT id, name FROM release_groups WHERE kind = 'p2p' AND lower(name) = lower(?)",
    target.name,
  )[0];
  const byName = new Map(threads.map((o) => [o.name.toLowerCase(), o]));
  const xrelOnly = (group ? xrelOffers(group.id, group.name) : []).filter((x) => {
    const thread = byName.get(x.name.toLowerCase());
    if (!thread) return true;
    Object.assign(thread, { links: [...thread.links, ...x.links], size: x.size, whole: x.whole });
    return false;
  });
  return [...threads, ...xrelOnly];
}

// A WEB release's name: WEB after its language ("…GERMAN.AAC.1080p.WEB.x265",
// "German.AC3.DL.1080p.Web", "WEB-DL"), not in a title before it
// ("The.Office.S04E03.Das.World.Wide.Web.GERMAN…").
const WEB = /[.\s](german|deutsch)[.\s].*[.\s]web(-?dl|-?rip)?[.\s-]/i;
const RANK: Record<string, number> = { SD: 0, "720p": 1, "1080p": 2, "4K": 3 };
const rankOfName = (name: string) => (/2160p/i.test(name) ? 3 : /1080p/i.test(name) ? 2 : /720p/i.test(name) ? 1 : 0);

// For each target, each movie or season of a show it offers that the
// library has: a row of the library's files from anyone else (any of a
// season's episodes), with all its offers of it; and a row of the target's
// own WEB files when it has a BluRay of at least their resolution (a 1080p
// BluRay is no upgrade of a 4K WEB), with those offers. Then a none row
// for every movie or season left without a row.
export function migrationRows(): MigrationRow[] {
  const files = all<FileRow>(
    `SELECT kind, tmdb_id AS tmdbId, title, year, season, grp, grp_key AS grpKey, file_name AS fileName, resolution, size
     FROM media_files WHERE tmdb_id IS NOT NULL`,
  );
  // A movie, or a show's season: its files.
  const units = new Map<string, FileRow[]>();
  for (const f of files) {
    const key = f.kind === "movie" ? `movie:${f.tmdbId}` : `tv:${f.tmdbId}:${f.season}`;
    units.set(key, [...(units.get(key) ?? []), f]);
  }
  // A file's release: a movie's its name, an episode's its season's.
  const releaseName = (f: FileRow) => {
    const base = f.fileName.replace(/\.[a-z0-9]{2,4}$/i, "");
    if (f.kind === "movie") return base;
    const show = /^(.*?)\.S\d{1,2}E\d/i.exec(base)?.[1] ?? f.title;
    return `${show}.${seasonCode(f.season ?? 0)}.${releaseOf(f.fileName)}`;
  };
  const targets = migrationTargets();
  // Each DLoad uploader's threads, by their group (lowercase, as grpKey).
  const threadsOf = new Map(
    targets
      .filter((t) => t.dloadUser !== undefined)
      .map((t) => [t.name.toLowerCase(), offersOf(t).filter((o) => o.links.some((l) => l.label === "DLoad"))]),
  );
  const dload = (key: string, name: string, resolution: string, threads: Offer[]) => {
    const [type, tmdbId, season] = key.split(":");
    const of = threads.filter(
      (o) => tmdbKey(o.type, o.tmdbId) === tmdbKey(type, tmdbId) && (!season || o.seasons.includes(Number(season))),
    );
    const t =
      of.find((o) => o.name.toLowerCase() === name.toLowerCase()) ??
      of.find((o) => rankOfName(o.name) === RANK[resolution]) ??
      of[0];
    return t ? t.links.filter((l) => l.label === "DLoad") : [];
  };
  const rows: MigrationRow[] = [];
  const done = new Set<string>();
  const row = (target: string, kind: MigrationRow["kind"], key: string, swap: FileRow[], offers: Offer[]) => {
    if (!swap.length || (!offers.length && kind !== "none")) return;
    done.add(key);
    const [type, tmdbId, seasonPart] = key.split(":");
    const season = seasonPart === undefined ? null : Number(seasonPart);
    const counts = new Map<string, number>();
    for (const f of swap) counts.set(f.grp ?? "n/a", (counts.get(f.grp ?? "n/a") ?? 0) + 1);
    const names = Map.groupBy(swap, releaseName);
    rows.push({
      have: [...names]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([name, fs]) => ({
          name,
          size: fs.reduce((sum, f) => sum + f.size, 0),
          links: threadsOf.has(fs[0].grpKey ?? "")
            ? dload(key, name, fs[0].resolution, threadsOf.get(fs[0].grpKey ?? "")!)
            : [],
        })),
      kind,
      target,
      type: type as "movie" | "tv",
      tmdbId: Number(tmdbId),
      title: swap[0].title,
      year: swap[0].year,
      season,
      groups: [...counts].sort((a, b) => b[1] - a[1]).map(([g]) => g),
      resolution: swap[0].resolution,
      size: swap.reduce((sum, f) => sum + f.size, 0),
      episodes: season === null ? null : swap.length,
      offers: offers.map(({ name, links, size, whole }) => ({ name, links, size, whole })),
    });
  };
  for (const target of targets) {
    const group = target.name.toLowerCase();
    const byTitle = new Map<string, Offer[]>();
    for (const o of offersOf(target))
      byTitle.set(tmdbKey(o.type, o.tmdbId), [...(byTitle.get(tmdbKey(o.type, o.tmdbId)) ?? []), o]);
    for (const [key, list] of units) {
      const [type, tmdbId, seasonPart] = key.split(":");
      const season = seasonPart === undefined ? null : Number(seasonPart);
      const offered = (byTitle.get(tmdbKey(type, tmdbId)) ?? []).filter(
        (o) => season === null || o.seasons.includes(season),
      );
      if (!offered.length) continue;
      row(
        target.name,
        "replace",
        key,
        list.filter((f) => f.grpKey !== group),
        offered,
      );
      const web = list.filter((f) => f.grpKey === group && WEB.test(f.fileName));
      const best = Math.max(...web.map((f) => RANK[f.resolution] ?? 0));
      row(
        target.name,
        "upgrade",
        key,
        web,
        offered.filter((o) => /bluray/i.test(o.name) && rankOfName(o.name) >= best),
      );
    }
  }
  for (const [key, list] of units) if (!done.has(key)) row("", "none", key, list, []);
  return rows;
}
