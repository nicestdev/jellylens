import { sleep } from "./async";
import { parseReleaseName } from "./title-match";

// xREL's public API (no key needed): https://www.xrel.to/wiki/1681/API.html
// Limits: 900 calls per hour per IP, and search calls at most 2 per 5 seconds.
const API = "https://api.xrel.to/v2";

// A P2P release as xREL lists it, only the fields we read.
export type XrelP2pRelease = {
  id: string;
  dirname: string;
  link_href: string;
  category?: { meta_cat?: string; sub_cat?: string };
  pub_time: number;
  size_mb?: number;
  group?: { id: string; name: string };
  ext_info?: { id?: string; type?: string; uris?: string[] };
};

type XrelPage = {
  total_count: number;
  pagination: { current_page: number; per_page: number; total_pages: number };
  list: XrelP2pRelease[];
};

// Only what the Releases page uses. titleKey: xREL's id for the movie or
// show, so all releases of one title group together (a release xREL hasn't
// tied to a title stands alone). A movie's releases are split further by the
// year in their names ("e1~1995"): xREL now and then files a remake under
// the original, and each year is matched on its own (the Releases page puts
// the ones matched to the same movie back on one tile). Not a show's: its
// seasons' releases often carry their own year. imdbId: the IMDb id xREL
// links it to, only a candidate (see title_matches in lib/db.ts). quality:
// xREL's sub-category ("HD-1080p", "HD-2160p"); type: movie/tv. sizeMb:
// how big it is, if xREL says.
export type Release = {
  id: string;
  name: string;
  link: string;
  type: string;
  quality: string;
  publishedAt: number; // unix seconds
  sizeMb?: number;
  titleKey: string;
  imdbId?: string;
};

// Out of calls for this hour; resetAt is unix seconds. Says how long to
// wait rather than until when: the server's clock may be in another zone.
export class RateLimitError extends Error {
  constructor(public resetAt: number) {
    const minutes = Math.max(1, Math.ceil((resetAt - Date.now() / 1000) / 60));
    super(`xREL rate limit reached, try again in ${minutes} minute${minutes === 1 ? "" : "s"}`);
  }
}

// Calls left this hour, from the last response's headers. A sync stops
// before it would use up the last few, so the Settings page's own calls
// (adding a group) still get through.
const RESERVE = 10;
const globalForLimit = globalThis as unknown as { __xrelLimit?: { remaining: number; resetAt: number } };

async function call<T>(path: string, params: Record<string, string | number>, reserve = 0): Promise<T> {
  const limit = (globalForLimit.__xrelLimit ??= { remaining: 900, resetAt: 0 });
  const now = Date.now() / 1000;
  if (limit.resetAt > now && limit.remaining <= reserve) throw new RateLimitError(limit.resetAt);

  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(API + path + "?" + qs);
  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  const resetAt = Number(res.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(remaining) && Number.isFinite(resetAt) && resetAt > 0) {
    limit.remaining = remaining;
    limit.resetAt = resetAt;
  }
  if (res.status === 429) throw new RateLimitError(limit.resetAt || now + 3600);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error("xREL " + path + " failed: " + (body.error_description || "HTTP " + res.status));
  }
  return res.json();
}

export function toRelease(r: XrelP2pRelease): Release {
  const imdb = r.ext_info?.uris?.find((u) => u.startsWith("imdb:"))?.slice(5);
  const type = r.ext_info?.type || r.category?.meta_cat || "";
  const year = type === "movie" ? parseReleaseName(r.dirname).year : null;
  return {
    id: r.id,
    name: r.dirname,
    link: r.link_href,
    type,
    quality: r.category?.sub_cat || "",
    publishedAt: r.pub_time,
    sizeMb: r.size_mb || undefined,
    titleKey: r.ext_info?.id ? r.ext_info.id + (year ? "~" + year : "") : "release:" + r.id,
    imdbId: imdb,
  };
}

// One page of a group's releases, newest first.
export async function fetchGroupReleases(groupId: string, page: number) {
  const data = await call<XrelPage>("/p2p/releases.json", { group_id: groupId, per_page: 100, page }, RESERVE);
  return { releases: data.list.map(toRelease), totalPages: data.pagination.total_pages };
}

// Search calls one after another, 2.5 s apart (xREL allows 2 per 5 s). The
// queue lives on globalThis like the limit, looked up on every call.
const globalForSearch = globalThis as unknown as { __xrelSearchQueue?: Promise<unknown> };
function throttledSearch<T>(fn: () => Promise<T>): Promise<T> {
  const run = (globalForSearch.__xrelSearchQueue ?? Promise.resolve()).then(fn);
  globalForSearch.__xrelSearchQueue = run.catch(() => {}).then(() => sleep(2500));
  return run;
}

// xREL has no group lookup, and the id on its website (group-4085-vector)
// isn't the API's. So: search releases for the name and take the group of
// one that's tagged with exactly that name. "-NAME" matches the group tag
// at the end of release names; plain "NAME" mostly finds titles with it.
export async function findGroup(name: string): Promise<{ id: string; name: string } | null> {
  const data = await throttledSearch(() =>
    call<{ p2p_results?: XrelP2pRelease[] }>("/search/releases.json", { q: "-" + name, scene: 0, p2p: 1, limit: 100 }),
  );
  const wanted = name.toLowerCase();
  const hit = data.p2p_results?.find((r) => r.group?.name.toLowerCase() === wanted);
  return hit?.group ? { id: hit.group.id, name: hit.group.name } : null;
}

// A scene release as xREL's search returns it, only the fields we read.
// Unlike a P2P one it has no category: its video_type is the source
// ("Web-Rip"), not the resolution.
export type XrelSceneRelease = {
  id: string;
  dirname: string;
  link_href: string;
  time: number;
  group_name?: string;
  size?: { number: number; unit: string };
  ext_info?: { id?: string; type?: string; uris?: string[] };
};

function sizeMb(size?: { number: number; unit: string }): number | undefined {
  if (!size?.number) return undefined;
  if (size.unit === "GB") return Math.round(size.number * 1024);
  if (size.unit === "MB") return Math.round(size.number);
  return undefined;
}

// A scene release's quality by the name, in the P2P sub-categories' terms,
// so the filters, SD_QUALITIES (lib/store/releases.ts) and Upgrades take
// both alike.
export function sceneQuality(name: string): string {
  const res = /[._-](2160|1080|720)p[._-]/i.exec(name);
  if (res) return `HD-${res[1]}p`;
  return /xvid/i.test(name) ? "XviD" : "x264-SD";
}

export function toSceneRelease(r: XrelSceneRelease): Release {
  return {
    ...toRelease({ id: r.id, dirname: r.dirname, link_href: r.link_href, pub_time: r.time, ext_info: r.ext_info }),
    quality: sceneQuality(r.dirname),
    sizeMb: sizeMb(r.size),
  };
}

// Scene groups have no list of their own on the API, so their releases come
// from a search for the name, which only finds its latest (it stops at 100,
// in practice about 50). Each sync adds what's new, so they pile up over
// time. Unlike findGroup, "-NAME" finds nothing among scene releases, so
// it searches the plain name and keeps the ones tagged with it.
async function searchScene(name: string, reserve = 0): Promise<XrelSceneRelease[]> {
  const data = await throttledSearch(() =>
    call<{ results?: XrelSceneRelease[] }>("/search/releases.json", { q: name, scene: 1, p2p: 0, limit: 100 }, reserve),
  );
  const wanted = name.toLowerCase();
  return (data.results ?? []).filter((r) => r.group_name?.toLowerCase() === wanted);
}

// The scene group's name as xREL spells it, or null if it has none.
export async function findSceneGroup(name: string): Promise<string | null> {
  return (await searchScene(name))[0]?.group_name ?? null;
}

export async function fetchSceneReleases(name: string): Promise<Release[]> {
  return (await searchScene(name, RESERVE)).map(toSceneRelease);
}
