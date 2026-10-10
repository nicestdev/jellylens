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
import { resolveTitles } from "@/lib/sync-releases";
import { TMDB_LANGUAGE } from "@/lib/env";
import { TMDB_API_KEY } from "@/lib/env";
import { parseReleaseName } from "@/lib/title-match";
import { fetchTmdbEntry } from "@/lib/tmdb";

type Params = { params: Promise<{ key: string }> };

const TMDB_TILE = /^(movie|tv):(\d+)$/;

// What the title page shows on top: the first title's match; for a TMDB
// entry no favorite group has released (opened from Discover, Wishlist or
// Missing) TMDB's own data; else the newest release's name. null for a key
// nothing is known of.
async function headOf(key: string, titles: ReleaseDetail["titles"]): Promise<ReleaseHead | null> {
  const tmdb = key.match(TMDB_TILE);
  const shown = titles[0]?.match.shown;
  let base: Omit<ReleaseHead, "library" | "copies"> | null = shown?.title ? shown : null;
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
    const { title, year } = parseReleaseName(titles[0].Items[0]?.name ?? "");
    base = { title: title || titles[0].label, year, posterPath: null, mediaType: null, tmdbId: null };
  }
  if (!base) return null;
  const entry = base.tmdbId ? libraryIndex().get(`${base.mediaType}:${base.tmdbId}`) : undefined;
  const ref = libraryRef(entry);
  const copies =
    base.tmdbId && base.mediaType ? libraryCopies(base.mediaType === "movie" ? "movie" : "episode", base.tmdbId) : [];
  return { ...base, library: ref ? { ...ref, posterPath: entry?.posterPath ?? null } : null, copies };
}

// A movie's xREL title split by the year in its releases' names ("e1~2025",
// lib/xrel.ts) is one title again here: on one tile its parts matched the
// same entry anyway, often only a group's year a year off.
const xrelTitle = (titleKey: string) => titleKey.split("~")[0];
const partsOf = (key: string, titleKey: string) =>
  tileTitleKeys(key).filter((k) => xrelTitle(k) === xrelTitle(titleKey));

async function detail(key: string): Promise<ReleaseDetail> {
  const byTitle = Map.groupBy(tileTitleKeys(key), xrelTitle);
  const titles = [...byTitle.values()].map((keys) => {
    const releases = keys.flatMap(titleReleases).sort((a, b) => b.publishedAt - a.publishedAt);
    const Items = groupEpisodes(releases);
    const { title, year } = parseReleaseName(Items[0]?.name ?? "");
    const label = year && keys.length === 1 ? `${title} (${year})` : title;
    return { titleKey: keys[0], label, match: matchInfo(keys[0]), Items };
  });
  return { key, head: await headOf(key, titles), titles };
}

// GET /api/releases/<key> — the xREL titles on one tile, each with its
// releases (newest first) and how its match came about, for the title page
// the tile opens; admin only.
export async function GET(_req: Request, { params }: Params) {
  const { key } = await params;
  return Response.json((await detail(key)) satisfies ReleaseDetail);
}

// POST { titleKey, verdict: "wrong" | "xrel" | null } — a decision about one
// of the tile's titles from the page's menu (for all its parts on the
// tile): nothing from TMDB, xREL's link after all, or back to the automatic
// check. Applied right away. Answers with the tile, or the title's new one
// if it was the tile's last.
export async function POST(req: Request, { params }: Params) {
  const { key } = await params;
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
  const tile = await detail(key);
  return Response.json((tile.titles.length ? tile : await detail(tileOf(titleKey))) satisfies ReleaseDetail);
}
