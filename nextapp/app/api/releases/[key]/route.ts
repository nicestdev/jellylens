import type { ReleaseDetail, ReleaseHead } from "@/lib/api-types";
import {
  libraryCopies,
  libraryIndex,
  libraryRef,
  matchInfo,
  setVerdict,
  tileOf,
  tileTitleKeys,
  titleReleases,
} from "@/lib/store";
import { groupEpisodes } from "@/lib/release-labels";
import { inResolutions, namesByResolution, xrelRow } from "@/lib/title-rows";
import { resolveTitles } from "@/lib/sync-releases";
import { TMDB_LANGUAGE } from "@/lib/env";
import { TMDB_API_KEY } from "@/lib/env";
import { parseReleaseName } from "@/lib/title-match";
import { fetchAiredEpisodes, fetchTmdbEntry, type SeasonAiring } from "@/lib/tmdb";

type Params = { params: Promise<{ key: string }> };

const TMDB_TILE = /^(movie|tv):(\d+)$/;

// A show's aired episodes per season, kept an hour (on globalThis, so it
// survives dev reloads and tests can reset it): going back and forth
// between title pages asks TMDB once.
const AIRED_TTL_MS = 60 * 60 * 1000;
const g = globalThis as unknown as {
  __showAiring?: Map<number, { at: number; value: Record<number, SeasonAiring> }>;
};

async function airedOf(tmdbId: number): Promise<Record<number, SeasonAiring> | null> {
  const cache = (g.__showAiring ??= new Map());
  const hit = cache.get(tmdbId);
  if (hit && Date.now() - hit.at < AIRED_TTL_MS) return hit.value;
  if (!TMDB_API_KEY) return null;
  const value = await fetchAiredEpisodes(TMDB_API_KEY, tmdbId).catch(() => null);
  if (value) cache.set(tmdbId, { at: Date.now(), value });
  return value;
}

// What the title page shows on top: the first title's match; for a TMDB
// entry no favorite group has released (opened from Discover, Wishlist or
// Missing) TMDB's own data; else the newest release's name. null for a key
// nothing is known of.
async function headOf(key: string, titles: ReleaseDetail["titles"]): Promise<ReleaseHead | null> {
  const tmdb = key.match(TMDB_TILE);
  const shown = titles[0]?.match.shown;
  let base: Omit<ReleaseHead, "library" | "copies" | "aired"> | null = shown?.title ? shown : null;
  if (!base && tmdb && TMDB_API_KEY) {
    const entry = await fetchTmdbEntry(TMDB_API_KEY, tmdb[1] as "movie" | "tv", Number(tmdb[2]), TMDB_LANGUAGE).catch(
      () => null,
    );
    if (entry)
      base = {
        title: entry.title,
        year: entry.year,
        posterPath: entry.posterPath,
        mediaType: entry.mediaType,
        tmdbId: entry.tmdbId,
      };
  }
  if (!base && titles[0]) {
    const { title, year } = parseReleaseName(titles[0].items[0]?.name ?? "");
    base = { title: title || titles[0].label, year, posterPath: null, mediaType: null, tmdbId: null };
  }
  if (!base) return null;
  const entry = base.tmdbId ? libraryIndex().get(`${base.mediaType}:${base.tmdbId}`) : undefined;
  const ref = libraryRef(entry);
  const copies =
    base.tmdbId && base.mediaType ? libraryCopies(base.mediaType === "movie" ? "movie" : "episode", base.tmdbId) : [];
  const aired = base.mediaType === "tv" && base.tmdbId ? await airedOf(base.tmdbId) : null;
  return { ...base, library: ref ? { ...ref, posterPath: entry?.posterPath ?? null } : null, copies, aired };
}

// A movie's xREL title split by the year in its releases' names ("e1~2025",
// lib/xrel.ts) is one title again here: on one tile its parts matched the
// same entry anyway, often only a group's year a year off.
const xrelTitle = (titleKey: string) => titleKey.split("~")[0];
const partsOf = (key: string, titleKey: string) =>
  tileTitleKeys(key).filter((k) => xrelTitle(k) === xrelTitle(titleKey));

async function detail(key: string, resolutions: string[] = []): Promise<ReleaseDetail> {
  // On a TMDB entry's page WCX's releases come live from its page
  // (app/api/wcx-releases), so the stored ones are left out there, and a
  // title with only those with them; elsewhere they're all there is.
  const live = TMDB_TILE.test(key);
  const byTitle = Map.groupBy(tileTitleKeys(key), xrelTitle);
  const titles = [...byTitle.values()].flatMap((keys) => {
    const releases = keys
      .flatMap(titleReleases)
      .filter((r) => !live || !r.id.startsWith("wcx:"))
      .sort((a, b) => b.publishedAt - a.publishedAt);
    if (!releases.length) return [];
    const items = groupEpisodes(releases);
    const { title, year } = parseReleaseName(items[0]?.name ?? "");
    const label = year && keys.length === 1 ? `${title} (${year})` : title;
    return [{ titleKey: keys[0], label, match: matchInfo(keys[0]), items }];
  });
  const head = await headOf(key, titles);
  const available = namesByResolution(titles.flatMap((t) => t.items.map(xrelRow)));
  // Only the qualities asked for come down, a title with none of them staying listed.
  const keep = inResolutions(resolutions);
  return {
    key,
    head,
    titles: titles.map((t) => ({ ...t, items: t.items.filter((r) => keep(xrelRow(r))) })),
    resolutions: available,
  };
}

// ?resolution=1080p&resolution=2160p, repeated.
const resolutionsOf = (req: Request) => new URL(req.url).searchParams.getAll("resolution");

// GET /api/releases/<key>?resolution=… — the titles on one tile, each
// with its releases (newest first, of the qualities asked for, else all) and
// how its match came about, for the title page the tile opens; admin only.
export async function GET(req: Request, { params }: Params) {
  const { key } = await params;
  return Response.json((await detail(key, resolutionsOf(req))) satisfies ReleaseDetail);
}

// POST { titleKey, verdict: "wrong" | "xrel" | null } — a decision about one
// of the tile's titles from the page's menu (for all its parts on the
// tile): nothing from TMDB, xREL's link after all, or back to the automatic
// check. Applied right away. Answers with the tile, or the title's new one
// if it was the tile's last.
export async function POST(req: Request, { params }: Params) {
  const { key } = await params;
  const resolutions = resolutionsOf(req);
  const body = await req.json().catch(() => ({}));
  const { titleKey, verdict } = body;
  if (typeof titleKey !== "string" || (verdict !== "wrong" && verdict !== "xrel" && verdict !== null)) {
    return Response.json({ error: 'Expected { titleKey, verdict: "wrong" | "xrel" | null }.' }, { status: 400 });
  }
  if (!tileTitleKeys(key).includes(titleKey)) return Response.json({ error: "No such title." }, { status: 404 });
  for (const part of partsOf(key, titleKey)) {
    setVerdict(part, verdict);
    await resolveTitles(TMDB_API_KEY, TMDB_LANGUAGE, part);
  }
  const tile = await detail(key, resolutions);
  return Response.json(
    (tile.titles.length ? tile : await detail(tileOf(titleKey), resolutions)) satisfies ReleaseDetail,
  );
}
