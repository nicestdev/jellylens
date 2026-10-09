import type { WcxAddResponse, WcxMirror, WcxRelease, WcxReleasesResponse } from "@/lib/api-types";
import { packageDir } from "@/lib/downloader";
import { TMDB_API_KEY, WCX_API_URL } from "@/lib/env";
import { linkInfo, nameFromUrl, routeOf } from "@/lib/hosters";
import { resolutionOf, seasonsOf } from "@/lib/release-labels";
import { addPackage, setPackageMedia, wcxUid, type DownloadMedia } from "@/lib/store";
import { ensureMetadataLanguage } from "@/lib/sync-manager";
import { fetchTmdbEntry } from "@/lib/tmdb";

// A release as WCX's detail answer has it. links: per hoster, plain hoster
// links (some with stray spaces); crypted_links (filecrypt, hide.cx): per
// hoster, its container.
type ExternalRelease = {
  uid?: string;
  fulltitle?: string;
  group?: string | null;
  size?: number | null;
  created_at?: string | null;
  links?: Record<string, string[]> | null;
  crypted_links?: Record<string, string> | null;
};
type ExternalDetail = { item?: { releases?: ExternalRelease[] } };

// A release with its mirrors' links, which stay on the server. links: per
// hoster, WCX's plain ones; hide: per hoster, its hide.cx container's.
type Release = WcxRelease & { links: Map<string, string[]>; hide: Map<string, HideLinks> };
type HideLinks = { container: string; links: string[] };

// How a mirror would be fetched, by its first link (a hoster's links all
// go the same way). null if nothing can, or Real-Debrid's list didn't load.
async function routeLabel(links: string[]): Promise<string | null> {
  try {
    return links.length ? ((await routeOf(links[0]))?.label ?? null) : null;
  } catch {
    return null;
  }
}

// Whether a link is gone at its hoster: a re-upload leaves WCX with the
// old links. Kept for CHECK_MS (see test/state.ts); a hoster that doesn't
// answer counts as online.
const CHECK_MS = 10 * 60 * 1000;
const g = globalThis as unknown as {
  __wcxLinkState?: Map<string, { offline: boolean; at: number }>;
  __wcxReleases?: Map<string, { releases: Release[]; at: number }>;
  __hideCx?: Map<string, { links: string[] | null; at: number }>;
};

async function isOffline(url: string): Promise<boolean> {
  const known = (g.__wcxLinkState ??= new Map()).get(url);
  if (known && Date.now() - known.at < CHECK_MS) return known.offline;
  const info = await linkInfo(url).catch(() => null);
  const offline = info?.online === false;
  g.__wcxLinkState.set(url, { offline, at: Date.now() });
  return offline;
}

// hide.cx's API answers without a captcha (and without an account): a
// container's links with their state, and each link's hoster URL by its id.
const HIDE_CX_API = "https://api.hide.cx";
const hideCxId = (url: string | null) =>
  (url && /\/\/(?:www\.)?hide\.cx\/(?:container|state)\/([a-f0-9-]{32,36})/i.exec(url)?.[1]) || null;

async function hideCx<T>(path: string, init?: RequestInit): Promise<T> {
  // Without this Accept, it answers 404.
  const res = await fetch(`${HIDE_CX_API}${path}`, {
    ...init,
    headers: { Accept: "application/json, text/plain, */*", ...init?.headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`hide.cx answered HTTP ${res.status}`);
  return res.json();
}

// The ids of a hide.cx container's links (its first mirror's, by name), if
// they're all online; null if not, or it can't be asked. Kept CHECK_MS.
async function liveContainerLinks(id: string): Promise<string[] | null> {
  const known = (g.__hideCx ??= new Map()).get(id);
  if (known && Date.now() - known.at < CHECK_MS) return known.links;
  type Link = { id: string; link_type?: string; link_status?: string; name?: string | null };
  const data = await hideCx<{ links?: Link[] }>(`/containers/${id}`).catch(() => null);
  const all = data?.links ?? [];
  const mirror = all.filter((l) => l.link_type === all[0]?.link_type);
  const links =
    mirror.length && mirror.every((l) => l.link_status === "online")
      ? mirror.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { numeric: true })).map((l) => l.id)
      : null;
  g.__hideCx.set(id, { links, at: Date.now() });
  return links;
}

// Runs fn over items, at most `limit` at a time.
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// The menu lists mirrors we can fetch first, a hoster's own account
// before Real-Debrid.
const rank = (m: WcxMirror) => (m.route === null ? 2 : m.route.includes("Real-Debrid") ? 1 : 0);

// The releases on the entry's WCX page, newest first; none if it has no
// page (/api/wcx-search finds it first). Throws if WCX can't be asked.
async function releasesOf(tmdbId: string): Promise<Release[]> {
  const uid = wcxUid(tmdbId);
  if (!uid || !WCX_API_URL) return [];
  const res = await fetch(`${WCX_API_URL}/start/d/${encodeURIComponent(uid)}`);
  if (!res.ok) throw new Error(`WCX answered HTTP ${res.status}`);
  const data: ExternalDetail = await res.json();
  const releases = await Promise.all(
    (data.item?.releases ?? []).map(async (r): Promise<Release | null> => {
      if (!r.uid || !r.fulltitle) return null;
      const links = new Map(
        Object.entries(r.links ?? {})
          .map(
            ([hoster, list]) =>
              [hoster, (list ?? []).map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l))] as const,
          )
          .filter(([, list]) => list.length),
      );
      const wcx: WcxMirror[] = await Promise.all(
        [...links].map(async ([hoster, list]) => ({
          hoster,
          source: "wcx" as const,
          links: list.length,
          route: await routeLabel(list),
          offline: false,
          container: null,
        })),
      );
      // A container's mirror is fetched the way the hoster's plain links
      // would be (a hide.cx one's links are read below).
      const crypted: WcxMirror[] = await Promise.all(
        Object.entries(r.crypted_links ?? {}).flatMap(([hoster, url]) => {
          const container = url?.trim();
          const source = hideCxId(container)
            ? "hide.cx"
            : /\/\/(?:www\.)?filecrypt\.(?:cc|co)\//i.test(container)
              ? "filecrypt"
              : null;
          if (!source) return [];
          return [
            (async () => ({
              hoster,
              source,
              links: 0,
              route: await routeLabel(links.get(hoster) ?? []),
              offline: false,
              container,
            }))(),
          ];
        }),
      );
      const mirrors = [...wcx, ...crypted];
      return {
        uid: r.uid,
        name: r.fulltitle,
        group: r.group || /-([^.-]+)$/.exec(r.fulltitle)?.[1] || null,
        quality: resolutionOf(r.fulltitle),
        seasons: seasonsOf(r.fulltitle),
        size: r.size || null,
        createdAt: r.created_at ?? null,
        mirrors: mirrors.sort((a, b) => rank(a) - rank(b)),
        links,
        hide: new Map(),
      };
    }),
  );
  const found = releases
    .filter((r): r is Release => r !== null)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  // Each WCX mirror's first link checked: a dead first part means a re-upload.
  const plain = found.flatMap((r) =>
    r.mirrors.filter((m) => m.source === "wcx").map((m) => ({ m, url: r.links.get(m.hoster)![0] })),
  );
  await pool(plain, 8, async ({ m, url }) => {
    m.offline = await isOffline(url);
  });
  // A hide.cx container's links, all online (else it counts as gone).
  const hidden = found.flatMap((r) => r.mirrors.filter((m) => m.source === "hide.cx").map((m) => ({ r, m })));
  await pool(hidden, 8, async ({ r, m }) => {
    const container = hideCxId(m.container)!;
    const links = await liveContainerLinks(container);
    m.offline = !links;
    m.links = links?.length ?? 0;
    if (links) r.hide.set(m.hoster, { container, links });
  });
  return found;
}

// The releases as last read, for CHECK_MS too, so going back and forth
// between title pages asks WCX (and the hosters) once per entry. Adding
// one reads them fresh, so no stale link ends up in Downloads.
async function cachedReleasesOf(tmdbId: string): Promise<Release[]> {
  const known = (g.__wcxReleases ??= new Map()).get(tmdbId);
  if (known && Date.now() - known.at < CHECK_MS) return known.releases;
  const releases = await releasesOf(tmdbId);
  g.__wcxReleases.set(tmdbId, { releases, at: Date.now() });
  return releases;
}

// A hide.cx container's hoster URLs, a request each (it gives them to its
// owner only, in the container's answer).
async function hosterUrls({ container, links }: HideLinks): Promise<string[]> {
  const urls: string[] = new Array(links.length);
  await pool(
    links.map((id, i) => ({ id, i })),
    4,
    async ({ id, i }) => {
      const { url } = await hideCx<{ url?: string }>(`/containers/${container}/links/${id}`);
      if (!url || !/^https?:\/\//i.test(url)) throw new Error("a link came without its URL");
      urls[i] = url.trim();
    },
  );
  return urls;
}

// The package's movie or show is the title page's TMDB entry, not a search by
// its name (which German names spelled without umlauts can miss). null if
// TMDB can't be asked; the Downloads page then searches as usual.
async function mediaOf(tmdbId: string): Promise<DownloadMedia | null> {
  if (!TMDB_API_KEY) return null;
  const [type, id] = tmdbId.split(":") as ["movie" | "tv", string];
  const entry = await fetchTmdbEntry(TMDB_API_KEY, type, Number(id), await ensureMetadataLanguage()).catch(() => null);
  return entry && { type, tmdbId: entry.tmdbId, title: entry.title, year: entry.year, posterPath: entry.posterPath };
}

const badTmdbId = (tmdbId: unknown) => typeof tmdbId !== "string" || !/^(movie|tv):\d+$/.test(tmdbId);

// GET /api/wcx-releases?tmdbId=movie:949 — what WCX has of the entry, with
// its mirrors (kept CHECK_MS, see cachedReleasesOf); admin only (proxy.ts).
export async function GET(req: Request) {
  const tmdbId = new URL(req.url).searchParams.get("tmdbId") ?? "";
  if (badTmdbId(tmdbId)) return Response.json({ error: "Expected tmdbId=movie:<id> or tv:<id>." }, { status: 400 });
  try {
    const releases = (await cachedReleasesOf(tmdbId)).map(({ links: _l, hide: _h, ...r }) => r);
    return Response.json({ releases } satisfies WcxReleasesResponse);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}

// POST { tmdbId, release, hoster, source } — adds a WCX release as a
// Downloads package (pending, like one added there), from the mirror picked
// (source: "wcx", the default, or "hide.cx"; a filecrypt one is opened).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    tmdbId?: unknown;
    release?: unknown;
    hoster?: unknown;
    source?: unknown;
  } | null;
  const source = body?.source ?? "wcx";
  if (
    !body ||
    badTmdbId(body.tmdbId) ||
    typeof body.release !== "string" ||
    typeof body.hoster !== "string" ||
    (source !== "wcx" && source !== "hide.cx")
  ) {
    return Response.json(
      { error: 'Expected { tmdbId, release, hoster, source: "wcx" | "hide.cx" }.' },
      { status: 400 },
    );
  }
  let releases: Release[];
  try {
    releases = await releasesOf(body.tmdbId as string);
    g.__wcxReleases?.set(body.tmdbId as string, { releases, at: Date.now() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
  const release = releases.find((r) => r.uid === body.release);
  if (!release) return Response.json({ error: "WCX doesn't have that release (any more)." }, { status: 404 });
  const mirror = release.mirrors.find((m) => m.hoster === body.hoster && m.source === source);
  if (!mirror)
    return Response.json({ error: `WCX has no ${body.hoster} mirror of it from ${source}.` }, { status: 404 });
  if (mirror.offline) {
    return Response.json(
      {
        error:
          source === "wcx"
            ? `The ${mirror.hoster} links are gone (re-uploaded?): try its container instead.`
            : `The ${mirror.hoster} links in its hide.cx container aren't all online.`,
      },
      { status: 410 },
    );
  }
  if (!mirror.route) {
    return Response.json(
      {
        error: `${mirror.hoster} can't be fetched: there's no account for it, and Real-Debrid doesn't cover it (or isn't set up).`,
      },
      { status: 400 },
    );
  }
  let urls: string[];
  if (source === "hide.cx") {
    try {
      urls = await hosterUrls(release.hide.get(mirror.hoster)!);
    } catch (e) {
      return Response.json({ error: `hide.cx: ${(e as Error).message}` }, { status: 502 });
    }
  } else urls = release.links.get(mirror.hoster)!;
  const files = urls.map((url) => ({ url, name: nameFromUrl(url), size: null }));
  // Asked first: once the package is there, the Downloads page may start
  // its own search, which this mustn't race.
  const media = await mediaOf(body.tmdbId as string);
  const packageId = addPackage({ name: release.name, dir: packageDir(release.name), files });
  if (media) setPackageMedia(packageId, media);
  return Response.json({ packageId, name: release.name, hoster: mirror.hoster } satisfies WcxAddResponse);
}
