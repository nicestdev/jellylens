import { setSyncedAt } from "./store";
import {
  groupExists,
  insertReleases,
  listGroups,
  markGroupSynced,
  pendingTitles,
  saveImdbLookup,
  saveTitleMatch,
  unlookedImdbIds,
} from "./store";
import { fetchGroupReleases, RateLimitError } from "./xrel";
import { fetchTmdbTitles, findTmdbByImdb, searchTmdbTitle } from "./tmdb";
import { mapWithConcurrency } from "./async";
import { decideMatch, type TitleLookup } from "./title-match";

// What the sync is doing right now, for the Settings and Releases pages:
// the group being fetched, or matching titles to TMDB.
const globalForSync = globalThis as unknown as { __releaseSync?: { groupId: string | null; matching: boolean } };
export const releaseSync = (globalForSync.__releaseSync ??= { groupId: null, matching: false });

// A group's first sync walks its whole list; after that it stops at the
// first page with a release it already has. Releases are stored by id, so
// a list that shifts while we page through it never duplicates any.
async function syncGroup(group: { id: string; complete: boolean }): Promise<number> {
  let added = 0;
  for (let page = 1; ; page++) {
    const { releases, totalPages } = await fetchGroupReleases(group.id, page);
    // Removed from Settings while this ran.
    if (!groupExists(group.id)) return added;
    const result = insertReleases(group.id, releases);
    added += result.added;
    if (page >= totalPages || releases.length === 0 || (group.complete && result.known)) break;
  }
  markGroupSynced(group.id, new Date().toISOString());
  return added;
}

// Looks up each new IMDb id xREL gave on TMDB: the candidate its titles are
// checked against. A failed lookup isn't stored, so the next sync retries.
async function lookUpImdbIds(tmdbApiKey: string, language: string) {
  await mapWithConcurrency(unlookedImdbIds(), 5, async ({ imdbId, type }) => {
    try {
      saveImdbLookup(imdbId, await findTmdbByImdb(tmdbApiKey, imdbId, language, type === "tv" ? "tv" : "movie"));
    } catch (e) {
      console.error("[releases-sync] TMDB lookup of " + imdbId + " failed:", (e as Error).message);
    }
  });
}

// Works out what every new title shows (or, with only, that one title;
// see decideMatch). A title whose TMDB calls fail is left for the next sync.
export async function resolveTitles(tmdbApiKey: string, language: string, only?: string) {
  const lookup: TitleLookup | null = tmdbApiKey
    ? {
        otherTitles: (entry) => fetchTmdbTitles(tmdbApiKey, entry.mediaType, entry.tmdbId),
        search: (kind, query, year) => searchTmdbTitle(tmdbApiKey, kind, query, year, language),
      }
    : null;
  await mapWithConcurrency(pendingTitles(only), 5, async (t) => {
    try {
      const { status, entry, fallback } = await decideMatch(t, lookup);
      saveTitleMatch(t.titleKey, status, entry, fallback);
    } catch (e) {
      console.error("[releases-sync] matching " + t.names[0] + " failed:", (e as Error).message);
    }
  });
}

// Syncs every favorite group in turn, then looks up and checks new titles
// on TMDB. A group added while this runs is picked up before it ends, even
// one added while the titles were checked (that takes minutes after a big
// first sync): its releases load next, then their titles are checked. Out
// of xREL calls, it stops and keeps what it has; the next run carries on (a
// first sync that was cut off walks the list again, adding what's missing).
export async function syncReleases({ tmdbApiKey, language }: { tmdbApiKey: string; language: string }) {
  const done = new Set<string>();
  const nextGroup = () => listGroups().find((g) => !done.has(g.id));
  let added = 0;
  let firstError: Error | null = null;
  try {
    do {
      for (let group = nextGroup(); group; group = nextGroup()) {
        done.add(group.id);
        releaseSync.groupId = group.id;
        try {
          added += await syncGroup(group);
        } catch (e) {
          if (e instanceof RateLimitError) throw e;
          firstError ??= e as Error;
          console.error("[releases-sync] " + group.name + " failed:", (e as Error).message);
        }
      }
      releaseSync.groupId = null;
      releaseSync.matching = true;
      if (tmdbApiKey) await lookUpImdbIds(tmdbApiKey, language);
      await resolveTitles(tmdbApiKey, language);
      releaseSync.matching = false;
    } while (nextGroup());
  } finally {
    releaseSync.groupId = null;
    releaseSync.matching = false;
  }
  if (firstError) throw firstError;
  setSyncedAt("releases", new Date().toISOString());
  return { groups: done.size, added };
}
