import type { NextRequest } from "next/server";
import type { ReleasesResponse } from "@/lib/api-types";
import { libraryIndex, libraryRef, queryTitles, releaseCounts, releaseFacets, tileCount, type LibraryEntry } from "@/lib/store";
import { releaseSync } from "@/lib/sync-releases";
import { fold } from "@/lib/text";
import { parseReleaseName } from "@/lib/title-match";

const PAGE_SIZE = 60;

// An owned title shows the library's own poster (already cached for the
// Movies and TV Shows pages) rather than TMDB's.
function libraryItem(entry: LibraryEntry | undefined) {
  const ref = libraryRef(entry);
  return ref ? { ...ref, imageTag: entry?.imageTag ?? null } : null;
}

// GET /api/releases?q=&group=&quality=&type=&sort=date|title&dir=&offset=
// The favorite groups' releases as one tile per movie or show, for the
// Releases page; admin only (see proxy.ts). Words match a release name or
// the checked title; facet params can repeat (any of them matches). The
// filter values are over everything, so the menu doesn't shrink as you
// narrow it down.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const sort = params.get("sort") === "title" ? "title" : "date";
  const asc = params.get("dir") ? params.get("dir") === "asc" : sort === "title";
  const offset = Math.max(0, Number(params.get("offset")) || 0);

  const filters = {
    words: fold(params.get("q") ?? "").split(" ").filter(Boolean),
    group: params.getAll("group"),
    quality: params.getAll("quality"),
    type: params.getAll("type"),
  };
  const { matched, items } = queryTitles(filters, sort, asc, offset, PAGE_SIZE);
  const narrowed = Object.values(filters).some((values) => values.length > 0);
  const index = libraryIndex();

  return Response.json({
    // Not narrowed down, every tile matched.
    total: narrowed ? tileCount() : matched,
    matched,
    Items: items.map((t) => ({
      ...t,
      // Before its first check a title has no year but its release name's.
      year: t.year ?? parseReleaseName(t.sample).year,
      library: t.tmdbId ? libraryItem(index.get(t.mediaType + ":" + t.tmdbId)) : null,
    })),
    facets: releaseFacets(),
    groups: releaseCounts().groups,
    syncing: releaseSync.groupId !== null || releaseSync.matching,
  } satisfies ReleasesResponse);
}
