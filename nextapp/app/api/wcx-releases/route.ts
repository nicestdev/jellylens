import type { WcxAddResponse, WcxMirror, WcxRelease, WcxReleasesResponse } from "@/lib/api-types";
import { packageDir } from "@/lib/downloader";
import { startIfNew } from "@/lib/download-match";
import { TMDB_API_KEY, WCX_API_URL } from "@/lib/env";
import { linkInfo, nameFromUrl, routeOf } from "@/lib/hosters";
import { resolutionOf, seasonsOf } from "@/lib/release-labels";
import { inResolutions, namesByResolution, wcxRow } from "@/lib/title-rows";
import { candidates, byPreference } from "@/lib/mirrors";
import { addPackage, setPackageMedia, wcxUid, type DownloadMedia } from "@/lib/store";
import { TMDB_LANGUAGE } from "@/lib/env";
import { fetchTmdbEntry } from "@/lib/tmdb";
import { log } from "@/lib/log";
import { plural } from "@/lib/format";

// A release as WCX's detail answer has it. links: per hoster, plain hoster
// links (some with stray spaces); crypted_links (filecrypt, hide.cx): per
// hoster, its container. options.episode_count_in_season: how many
// episodes of its season the release holds so far (WCX adds them as they
// come out, so one not kept up has fewer).
type ExternalRelease = {
  uid?: string;
  fulltitle?: string;
  group?: string | null;
  size?: number | null;
  created_at?: string | null;
  links?: Record<string, string[]> | null;
  crypted_links?: Record<string, string> | null;
  options?: { episode_count_in_season?: string | number | null } | null;
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
      // would be; without any, a hide.cx one's route comes from its own
      // links on Check (POST).
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
        seasonEpisodes: Number(r.options?.episode_count_in_season) || null,
        // WCX has the odd size a million times too big (1.3 PB for a 1.3 GB film).
        size: r.size && r.size < 1e13 ? r.size : null,
        createdAt: r.created_at ?? null,
        mirrors: mirrors.sort(byPreference),
        links,
        hide: new Map(),
      };
    }),
  );
  return releases
    .filter((r): r is Release => r !== null)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

// Whether a mirror works: a WCX one's first link (a dead first part means
// a re-upload), a hide.cx container's links all online (else it counts as
// gone, and the ids are kept for adding it).
async function checkMirror(r: Release, m: WcxMirror): Promise<void> {
  if (m.source === "wcx") m.offline = await isOffline(r.links.get(m.hoster)![0]);
  else if (m.source === "hide.cx") {
    const container = hideCxId(m.container)!;
    const links = await liveContainerLinks(container);
    m.offline = !links;
    m.links = links?.length ?? 0;
    if (links) r.hide.set(m.hoster, { container, links });
  }
}

// The releases as last read, for CHECK_MS too, so going back and forth
// between title pages asks WCX once per entry. Nothing is checked here:
// a release's mirrors are, on Check (POST).
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
// TMDB can't be asked; the Queue then searches as usual.
async function mediaOf(tmdbId: string): Promise<DownloadMedia | null> {
  if (!TMDB_API_KEY) return null;
  const [type, id] = tmdbId.split(":") as ["movie" | "tv", string];
  const entry = await fetchTmdbEntry(TMDB_API_KEY, type, Number(id), TMDB_LANGUAGE).catch(() => null);
  return entry && { type, tmdbId: entry.tmdbId, title: entry.title, year: entry.year, posterPath: entry.posterPath };
}

const badTmdbId = (tmdbId: unknown) => typeof tmdbId !== "string" || !/^(movie|tv):\d+$/.test(tmdbId);

// GET /api/wcx-releases?tmdbId=movie:949&resolution=… — what WCX has of the entry, with
// its mirrors (kept CHECK_MS, see cachedReleasesOf); admin only (proxy.ts).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tmdbId = url.searchParams.get("tmdbId") ?? "";
  if (badTmdbId(tmdbId)) return Response.json({ error: "Expected tmdbId=movie:<id> or tv:<id>." }, { status: 400 });
  try {
    const all = (await cachedReleasesOf(tmdbId)).map(({ links: _l, hide: _h, ...r }) => r);
    // Only the qualities asked for come down (`?resolution=`, repeated), else all.
    const keep = inResolutions(url.searchParams.getAll("resolution"));
    const releases = all.filter((r) => keep(wcxRow(r)));
    return Response.json({ releases, resolutions: namesByResolution(all.map(wcxRow)) } satisfies WcxReleasesResponse);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}

// POST { tmdbId, releases } — Check on the title page: one release (the
// uids of its WCX copies) read fresh, its mirrors tried in the order
// they're taken (lib/mirrors.ts), and the first online one added as a
// Queue package, started right away only when the library has nothing of
// it (else it waits under Needs attention). With none online, a
// filecrypt container to open for its DLC (captcha), else none.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { tmdbId?: unknown; releases?: unknown } | null;
  const uids = body?.releases;
  if (
    !body ||
    badTmdbId(body.tmdbId) ||
    !Array.isArray(uids) ||
    !uids.length ||
    !uids.every((u) => typeof u === "string")
  ) {
    return Response.json({ error: "Expected { tmdbId, releases: [uid, …] }." }, { status: 400 });
  }
  let releases: Release[];
  try {
    releases = await releasesOf(body.tmdbId as string);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
  const copies = releases.filter((r) => uids.includes(r.uid));
  if (!copies.length) return Response.json({ error: "WCX doesn't have that release (any more)." }, { status: 404 });

  for (const { release, mirror } of candidates(copies)) {
    const r = release as Release;
    await checkMirror(r, mirror);
    if (mirror.offline) {
      log.info("wcx", `Mirror offline: ${mirror.hoster} (${mirror.source}) of ${r.name}`);
      continue;
    }
    let urls: string[];
    if (mirror.source === "hide.cx") {
      try {
        urls = await hosterUrls(r.hide.get(mirror.hoster)!);
      } catch {
        continue;
      }
      // No plain WCX links to tell how it's fetched: its own say it.
      mirror.route ??= await routeLabel(urls);
      if (mirror.route === null) continue;
    } else urls = r.links.get(mirror.hoster)!;
    const files = urls.map((url) => ({ url, name: nameFromUrl(url), size: null }));
    // Asked first: once the package is there, the Queue may start
    // its own search, which this mustn't race.
    const media = await mediaOf(body.tmdbId as string);
    const packageId = addPackage({ name: r.name, dir: packageDir(r.name), files });
    if (media) setPackageMedia(packageId, media);
    const started = await startIfNew(packageId);
    log.info("wcx", `Added ${r.name}`, `· ${mirror.hoster} (${mirror.source}) · ${plural(files.length, "file")}`);
    return Response.json({
      result: "added",
      packageId,
      name: r.name,
      started,
      hoster: mirror.hoster,
      source: mirror.source,
    } satisfies WcxAddResponse);
  }
  const crypted = copies
    .flatMap((r) => r.mirrors)
    .filter((m) => m.source === "filecrypt" && m.container)
    .sort(byPreference)[0];
  log.warn("wcx", crypted ? `Only behind a captcha: ${copies[0].name}` : `No mirror online: ${copies[0].name}`);
  return Response.json(
    (crypted
      ? { result: "captcha", url: crypted.container!, hoster: crypted.hoster }
      : { result: "none" }) satisfies WcxAddResponse,
  );
}
