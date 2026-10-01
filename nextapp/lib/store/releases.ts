import { db, tx } from "../db";
import { fold, foldTitle } from "../text";
import type { Release } from "../xrel";
import { getPreferences } from "./preferences";
import { all, one, run } from "./sql";

// The release tables (release_groups, releases, imdb_lookups, title_matches,
// match_overrides in lib/db.ts).

const monthAgo = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

// xREL's sub-categories below 720p (its /p2p/categories). Unless the
// showSdReleases preference is on, their releases are stored but left out
// everywhere else: no tile, panel or filter shows them, and a title with
// nothing else isn't checked on TMDB. Stored, so turning it on shows them
// at once and a group's sync still knows where it left off.
export const SD_QUALITIES = ["XviD", "x264-SD", "x265-SD", "DVD-R"];

// The condition on releases (as r) that keeps them to the ones shown.
export const shownReleases = () =>
  getPreferences().showSdReleases ? "1" : `r.quality NOT IN (${SD_QUALITIES.map((q) => `'${q}'`).join(", ")})`;

// ---- Groups, in the order they were added

export type ReleaseGroup = { id: string; name: string; count: number; syncedAt: string | null; complete: boolean };

export function listGroups(): ReleaseGroup[] {
  return all<{ id: string; name: string; count: number; synced_at: string | null; complete: number }>(
    `SELECT g.id, g.name, g.synced_at, g.complete, (SELECT count(*) FROM releases r WHERE r.group_id = g.id) AS count
       FROM release_groups g ORDER BY g.added_at, g.rowid`
  ).map((g) => ({ id: g.id, name: g.name, count: g.count, syncedAt: g.synced_at, complete: Boolean(g.complete) }));
}

export const groupExists = (id: string) => Boolean(one("SELECT 1 FROM release_groups WHERE id = ?", id));
export const hasGroupNamed = (name: string) =>
  Boolean(one("SELECT 1 FROM release_groups WHERE lower(name) = lower(?)", name));

export function addGroup(id: string, name: string) {
  run("INSERT OR IGNORE INTO release_groups (id, name, added_at) VALUES (?, ?, ?)", id, name, new Date().toISOString());
}

// Its releases go with it (ON DELETE CASCADE).
export function removeGroup(id: string) {
  run("DELETE FROM release_groups WHERE id = ?", id);
}

export function markGroupSynced(id: string, at: string) {
  run("UPDATE release_groups SET complete = 1, synced_at = ? WHERE id = ?", at, id);
}

export function releaseCounts() {
  return one<{ groups: number; releases: number }>(
    "SELECT (SELECT count(*) FROM release_groups) AS groups, (SELECT count(*) FROM releases) AS releases"
  )!;
}

// Adds one page of a group's releases. known: some were stored already,
// which tells an incremental sync it has caught up. A stored one without
// a size gets it now (stored before sizes were).
export function insertReleases(groupId: string, releases: Release[]): { added: number; known: boolean } {
  return tx(() => {
    const exists = db().prepare("SELECT 1 FROM releases WHERE id = ?");
    const upsert = db().prepare(
      `INSERT INTO releases (id, group_id, title_key, name, link, type, quality, published_at, imdb_id, search, size_mb)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET size_mb = excluded.size_mb WHERE releases.size_mb IS NULL`
    );
    let added = 0;
    for (const r of releases) {
      if (!exists.get(r.id)) added++;
      upsert.run(
        r.id,
        groupId,
        r.titleKey,
        r.name,
        r.link,
        r.type,
        r.quality,
        r.publishedAt,
        r.imdbId ?? null,
        fold(r.name),
        r.sizeMb ?? null
      );
    }
    return { added, known: added < releases.length };
  });
}

// ---- TMDB entries behind xREL's IMDb ids: candidates for title_matches

// A TMDB movie or show, as found by IMDb id or by search.
export type TmdbEntry = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  originalTitle: string;
  year: number | null;
  posterPath: string | null;
};

// IMDb ids of releases not looked up on TMDB yet, and ones TMDB didn't know
// a month ago (it may by now). type: xREL's movie/tv, to pick TMDB's kind.
export function unlookedImdbIds(): { imdbId: string; type: string }[] {
  return all(
    `SELECT r.imdb_id AS imdbId, max(r.type) AS type
       FROM releases r LEFT JOIN imdb_lookups l ON l.imdb_id = r.imdb_id
      WHERE r.imdb_id IS NOT NULL AND ${shownReleases()} AND (l.imdb_id IS NULL OR (l.tmdb_id IS NULL AND l.checked_at < ?))
      GROUP BY r.imdb_id`,
    monthAgo()
  );
}

// entry null: TMDB doesn't know the id.
export function saveImdbLookup(imdbId: string, entry: TmdbEntry | null) {
  tx(() => {
    run(
      `INSERT INTO imdb_lookups (imdb_id, media_type, tmdb_id, title, original_title, year, poster_path, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (imdb_id) DO UPDATE SET media_type = excluded.media_type, tmdb_id = excluded.tmdb_id,
         title = excluded.title, original_title = excluded.original_title, year = excluded.year,
         poster_path = excluded.poster_path, checked_at = excluded.checked_at`,
      imdbId,
      entry?.mediaType ?? null,
      entry?.tmdbId ?? null,
      entry?.title ?? null,
      entry?.originalTitle ?? null,
      entry?.year ?? null,
      entry?.posterPath ?? null,
      new Date().toISOString()
    );
    // A new candidate may change what its titles show: check them again.
    run("DELETE FROM title_matches WHERE title_key IN (SELECT title_key FROM releases WHERE imdb_id = ?)", imdbId);
  });
}

type LookupRow = {
  media_type: "movie" | "tv";
  tmdb_id: number;
  title: string;
  original_title: string | null;
  year: number | null;
  poster_path: string | null;
};

function candidateFor(imdbId: string | null): TmdbEntry | null {
  if (!imdbId) return null;
  const l = one<LookupRow>("SELECT * FROM imdb_lookups WHERE imdb_id = ? AND tmdb_id IS NOT NULL", imdbId);
  if (!l) return null;
  return {
    mediaType: l.media_type,
    tmdbId: l.tmdb_id,
    title: l.title,
    originalTitle: l.original_title ?? "",
    year: l.year,
    posterPath: l.poster_path,
  };
}

// ---- What each title shows (title_matches) and decisions made by hand

export type MatchStatus = "verified" | "searched" | "unverified" | "confirmed" | "rejected";
export type Verdict = "wrong" | "xrel";

const verdictFor = (titleKey: string) =>
  one<{ verdict: Verdict }>("SELECT verdict FROM match_overrides WHERE title_key = ?", titleKey)?.verdict ?? null;

const imdbIdOf = (titleKey: string) =>
  one<{ imdbId: string | null }>("SELECT max(imdb_id) AS imdbId FROM releases WHERE title_key = ?", titleKey)?.imdbId ??
  null;

// A title whose match needs working out: new, or unverified a month ago
// (TMDB or xREL may have fixed it). names: a sample of its release names;
// candidate: the TMDB entry behind xREL's IMDb id, if any.
export type PendingTitle = {
  titleKey: string;
  type: string;
  names: string[];
  candidate: TmdbEntry | null;
  verdict: Verdict | null;
};

// only: just that title, whatever its state (after a decision by hand).
export function pendingTitles(only?: string): PendingTitle[] {
  const rows = all<{ titleKey: string; type: string; imdbId: string | null; names: string }>(
    `SELECT r.title_key AS titleKey, max(r.type) AS type, max(r.imdb_id) AS imdbId, json_group_array(r.name) AS names
       FROM releases r LEFT JOIN title_matches t ON t.title_key = r.title_key
      WHERE ${shownReleases()} AND (${only ? "r.title_key = ?" : "t.title_key IS NULL OR (t.status = 'unverified' AND t.checked_at < ?)"})
      GROUP BY r.title_key`,
    only ?? monthAgo()
  );
  return rows.map((r) => ({
    titleKey: r.titleKey,
    type: r.type,
    // Episodes of a show all say the same; a few names are plenty.
    names: (JSON.parse(r.names) as string[]).slice(0, 20),
    candidate: candidateFor(r.imdbId),
    verdict: verdictFor(r.titleKey),
  }));
}

// entry null: nothing from TMDB; title and year come from the release name.
export function saveTitleMatch(
  titleKey: string,
  status: MatchStatus,
  entry: TmdbEntry | null,
  fallback: { title: string; year: number | null }
) {
  const title = entry?.title ?? fallback.title;
  run(
    `INSERT INTO title_matches (title_key, status, media_type, tmdb_id, title, year, poster_path, search, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (title_key) DO UPDATE SET status = excluded.status, media_type = excluded.media_type,
       tmdb_id = excluded.tmdb_id, title = excluded.title, year = excluded.year,
       poster_path = excluded.poster_path, search = excluded.search, checked_at = excluded.checked_at`,
    titleKey,
    status,
    entry?.mediaType ?? null,
    entry?.tmdbId ?? null,
    title,
    entry ? entry.year : fallback.year,
    entry?.posterPath ?? null,
    foldTitle(title) + (entry?.originalTitle ? " " + foldTitle(entry.originalTitle) : ""),
    new Date().toISOString()
  );
}

// A decision from a title's panel (null takes it back). Its match is
// dropped, to be worked out again right after.
export function setVerdict(titleKey: string, verdict: Verdict | null) {
  tx(() => {
    if (verdict) {
      run(
        `INSERT INTO match_overrides (title_key, verdict, created_at) VALUES (?, ?, ?)
         ON CONFLICT (title_key) DO UPDATE SET verdict = excluded.verdict`,
        titleKey,
        verdict,
        new Date().toISOString()
      );
    } else {
      run("DELETE FROM match_overrides WHERE title_key = ?", titleKey);
    }
    run("DELETE FROM title_matches WHERE title_key = ?", titleKey);
  });
}

export type MatchInfo = {
  status: MatchStatus | null;
  shown: { title: string; year: number | null; posterPath: string | null; mediaType: "movie" | "tv" | null; tmdbId: number | null } | null;
  verdict: Verdict | null;
  candidate: { title: string; year: number | null } | null;
};

// For a title's panel: how its match came about, what the tile shows now
// (so the panel can follow a decision at once), and xREL's candidate when
// that isn't what's shown (so it can be picked by hand).
export function matchInfo(titleKey: string): MatchInfo {
  const t = one<{
    status: MatchStatus;
    tmdb_id: number | null;
    media_type: "movie" | "tv" | null;
    title: string;
    year: number | null;
    poster_path: string | null;
  }>("SELECT status, tmdb_id, media_type, title, year, poster_path FROM title_matches WHERE title_key = ?", titleKey);
  const candidate = candidateFor(imdbIdOf(titleKey));
  return {
    status: t?.status ?? null,
    shown: t
      ? { title: t.title, year: t.year, posterPath: t.poster_path, mediaType: t.media_type, tmdbId: t.tmdb_id }
      : null,
    verdict: verdictFor(titleKey),
    candidate: candidate && candidate.tmdbId !== t?.tmdb_id ? { title: candidate.title, year: candidate.year } : null,
  };
}

// ---- The Releases page

export type TitleFilters = { words: string[]; group: string[]; quality: string[]; type: string[] };

// One tile per TMDB entry: xREL sometimes keeps two titles for one movie
// (old SD rips and later releases, named a little differently), and those
// belong on one tile. A title matched to nothing on TMDB is a tile of its
// own. Tile keys: "movie:949", "tv:1399", or the xREL title key.
const TILE = "CASE WHEN t.tmdb_id IS NOT NULL THEN t.media_type || ':' || t.tmdb_id ELSE r.title_key END";
const TMDB_TILE = /^(movie|tv):(\d+)$/;

// A tile: the releases that match, with title, year and poster from
// title_matches. Before a title's first check it shows a release name
// (never xREL's possibly wrong title).
export type TitleRow = {
  key: string;
  title: string;
  year: number | null;
  posterPath: string | null;
  mediaType: "movie" | "tv" | null;
  tmdbId: number | null;
  type: string;
  releases: number;
  qualities: string[]; // xREL sub-categories among the matching releases
  groups: string[];
  latest: number;
  sample: string; // a release name, for the year before the first check
};

// LIKE patterns match literally: % and _ in a word are escaped.
const likeWord = (w: string) => "%" + w.replace(/[\\%_]/g, "\\$&") + "%";

const FROM = `FROM releases r
  JOIN release_groups g ON g.id = r.group_id
  LEFT JOIN title_matches t ON t.title_key = r.title_key`;

// Every word must be in a release name or the checked titles; facet values
// of one kind are alternatives.
function where(f: TitleFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [shownReleases()];
  const params: unknown[] = [];
  for (const w of f.words) {
    clauses.push("(r.search LIKE ? ESCAPE '\\' OR ifnull(t.search, '') LIKE ? ESCAPE '\\')");
    params.push(likeWord(w), likeWord(w));
  }
  for (const [column, values] of [
    ["g.name", f.group],
    ["r.quality", f.quality],
    ["r.type", f.type],
  ] as const) {
    if (!values.length) continue;
    clauses.push(`${column} IN (${values.map(() => "?").join(", ")})`);
    params.push(...values);
  }
  return { sql: "WHERE " + clauses.join(" AND "), params };
}

export function queryTitles(
  f: TitleFilters,
  sort: "date" | "title",
  asc: boolean,
  offset: number,
  limit: number
): { matched: number; items: TitleRow[] } {
  const w = where(f);
  const title = "coalesce(max(t.title), max(r.name))";
  const order = sort === "title" ? `lower(${title})` : "latest";
  const rows = all<Omit<TitleRow, "qualities" | "groups"> & { qualities: string; groups: string; matched: number }>(
    `SELECT ${TILE} AS key, ${title} AS title,
            max(t.year) AS year, max(t.poster_path) AS posterPath,
            max(t.media_type) AS mediaType, max(t.tmdb_id) AS tmdbId, max(r.type) AS type,
            count(*) AS releases, group_concat(DISTINCT r.quality) AS qualities,
            group_concat(DISTINCT g.name) AS groups, max(r.published_at) AS latest, max(r.name) AS sample,
            count(*) OVER () AS matched
       ${FROM} ${w.sql}
      GROUP BY key
      ORDER BY ${order} ${asc ? "ASC" : "DESC"}, key
      LIMIT ? OFFSET ?`,
    ...w.params,
    limit,
    offset
  );
  return {
    // Past the last page there's no row to carry the count.
    matched: rows[0]?.matched ?? (offset > 0 ? countTitles(w) : 0),
    items: rows.map((r) => ({
      key: r.key,
      title: r.title,
      year: r.year,
      posterPath: r.posterPath,
      mediaType: r.mediaType,
      tmdbId: r.tmdbId,
      type: r.type,
      releases: r.releases,
      qualities: r.qualities.split(",").filter(Boolean),
      groups: r.groups.split(","),
      latest: r.latest,
      sample: r.sample,
    })),
  };
}

function countTitles(w: { sql: string; params: unknown[] }): number {
  return one<{ n: number }>(`SELECT count(DISTINCT ${TILE}) AS n ${FROM} ${w.sql}`, ...w.params)!.n;
}

// Every tile, for "42 of 11.314 titles".
export const tileCount = () => countTitles(where({ words: [], group: [], quality: [], type: [] }));

// What the filter menu offers, over everything so it doesn't shrink as you
// narrow it down: groups in the order they were added, the rest A→Z.
export type ReleaseFacets = Record<"group" | "quality" | "type", string[]>;

export function releaseFacets(): ReleaseFacets {
  const distinct = (column: "quality" | "type") =>
    all<{ v: string }>(
      `SELECT DISTINCT r.${column} AS v FROM releases r WHERE r.${column} <> '' AND ${shownReleases()} ORDER BY v`
    ).map((r) => r.v);
  const groups = all<{ name: string }>(
    `SELECT name FROM release_groups g WHERE EXISTS (SELECT 1 FROM releases r WHERE r.group_id = g.id AND ${shownReleases()})
      ORDER BY added_at, rowid`
  );
  return { group: groups.map((g) => g.name), quality: distinct("quality"), type: distinct("type") };
}

export type TitleRelease = { id: string; name: string; link: string; quality: string; publishedAt: number; group: string };

// Every release of one title, newest first.
export function titleReleases(titleKey: string): TitleRelease[] {
  return all<TitleRelease>(
    `SELECT r.id, r.name, r.link, r.quality, r.published_at AS publishedAt, g.name AS "group"
       FROM releases r JOIN release_groups g ON g.id = r.group_id
      WHERE r.title_key = ? AND ${shownReleases()} ORDER BY r.published_at DESC`,
    titleKey
  );
}

// The xREL titles on a tile, the one with the newest release first.
export function tileTitleKeys(key: string): string[] {
  const tmdb = key.match(TMDB_TILE);
  return all<{ titleKey: string }>(
    `SELECT r.title_key AS titleKey FROM releases r LEFT JOIN title_matches t ON t.title_key = r.title_key
      WHERE ${shownReleases()} AND ${tmdb ? "t.media_type = ? AND t.tmdb_id = ?" : "r.title_key = ? AND t.tmdb_id IS NULL"}
      GROUP BY r.title_key ORDER BY max(r.published_at) DESC, r.title_key`,
    ...(tmdb ? [tmdb[1], Number(tmdb[2])] : [key])
  ).map((r) => r.titleKey);
}

// Which groups have released each of these TMDB entries ("movie:949"),
// A→Z; entries without a release are left out. For the request tiles.
export function groupsByTile(keys: string[]): Map<string, string[]> {
  const rows = all<{ key: string; name: string }>(
    `SELECT t.media_type || ':' || t.tmdb_id AS key, g.name
       FROM title_matches t JOIN releases r ON r.title_key = t.title_key JOIN release_groups g ON g.id = r.group_id
      WHERE t.tmdb_id IS NOT NULL AND ${shownReleases()} AND t.media_type || ':' || t.tmdb_id IN (SELECT value FROM json_each(?))
      GROUP BY key, g.id ORDER BY lower(g.name)`,
    JSON.stringify(keys)
  );
  const groups = new Map<string, string[]>();
  for (const r of rows) groups.set(r.key, [...(groups.get(r.key) ?? []), r.name]);
  return groups;
}

// The tile an xREL title is on now.
export function tileOf(titleKey: string): string {
  const t = one<{ media_type: string | null; tmdb_id: number | null }>(
    "SELECT media_type, tmdb_id FROM title_matches WHERE title_key = ?",
    titleKey
  );
  return t?.tmdb_id ? `${t.media_type}:${t.tmdb_id}` : titleKey;
}
