import {
  addDloadThreads,
  dloadUsers,
  hasDloadThread,
  renameDloadThread,
  setSyncedAt,
  syncedAt,
  type DloadThreadRow,
} from "./store";
import { sleep } from "./async";
import { fetchSearchPage, fetchThreadImdb, parseThreadTitle, sureTmdbId, tmdbOfImdb, type DloadHit } from "./dload";
import { log } from "./log";

// A sync reads no more than this many pages (20 threads each) per
// uploader and list; they open a few a day.
// shortcut: a sync stops at the first page with a thread it knows, so a gap of more than MAX_PAGES pages
// (a new uploader's older threads, or a table filled from an older crawl) isn't filled later; re-crawl by hand
// if that's ever wanted.
const MAX_PAGES = 5;

// Like someone reading one page before the next: 8–25 s, now and then a
// minute or two longer.
const pause = () => sleep(8000 + Math.random() * 17_000 + (Math.random() < 0.12 ? 40_000 + Math.random() * 80_000 : 0));

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Each uploader's threads opened since the last sync, newest first, page
// by page until one it has; each new one gets its TMDB title: by its title
// when that's sure (sureTmdbId), else by the IMDb id in its first post (one
// more page, after a pause). Then their posts since the last sync (a week
// back the first time): a known thread's title as it is now, which an
// upgrade changes ("… WEB …" to "… BluRay …").
export async function syncDload({ tmdbApiKey, language }: { tmdbApiKey: string; language: string }) {
  const startedAt = new Date().toISOString();
  const last = syncedAt("dload");
  const since = last ? Date.parse(last) - 60 * 60 * 1000 : Date.now() - WEEK_MS;
  let pages = 0;
  let added = 0;
  let renamed = 0;
  for (const user of dloadUsers()) {
    let searchUrl: string | null = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (pages) await pause();
      const res = await fetchSearchPage(user.id, "threads", page, searchUrl);
      searchUrl = res.searchUrl;
      pages++;
      const fresh = res.hits.filter((h) => !hasDloadThread(h.id));
      for (const hit of fresh) {
        const thread = await resolve(user.id, hit, searchUrl, tmdbApiKey, language);
        addDloadThreads([thread]);
        added++;
        if (!thread.type) log.info("dload", `Skipped thread ${hit.title}`, "· not a release");
        else if (thread.tmdbId)
          log.info("dload", `Added thread ${hit.title}`, `· TMDB ${thread.type} ${thread.tmdbId}`);
        else log.warn("dload", `Found no TMDB title for thread ${hit.title}`);
      }
      if (fresh.length < res.hits.length || !res.hits.length) break;
    }
    searchUrl = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      await pause();
      const res = await fetchSearchPage(user.id, "posts", page, searchUrl);
      searchUrl = res.searchUrl;
      pages++;
      for (const hit of res.hits)
        if (
          Date.parse(hit.postedAt) >= since &&
          renameDloadThread(hit.id, hit.title, parseThreadTitle(hit.title).seasons)
        ) {
          renamed++;
          log.info("dload", `Thread renamed to ${hit.title}`);
        }
      if (!res.hits.length || Date.parse(res.hits.at(-1)!.postedAt) < since) break;
    }
  }
  setSyncedAt("dload", startedAt);
  return { pages, added, renamed };
}

async function resolve(
  userId: number,
  hit: DloadHit,
  referer: string,
  tmdbApiKey: string,
  language: string,
): Promise<DloadThreadRow> {
  const t = parseThreadTitle(hit.title);
  const base = { id: hit.id, userId, title: hit.title, postedAt: hit.postedAt, seasons: t.seasons, imdbId: null };
  if (!t.release) return { ...base, type: null, tmdbId: null };
  const type = t.seasons.length ? "tv" : "movie";
  const sure = await sureTmdbId(tmdbApiKey, language, type, t);
  if (sure) return { ...base, type, tmdbId: sure };
  await pause();
  const imdbId = await fetchThreadImdb(hit.id, referer);
  const found = imdbId ? await tmdbOfImdb(tmdbApiKey, language, imdbId, type, t.year) : null;
  return { ...base, imdbId, type: found?.type ?? type, tmdbId: found?.tmdbId ?? null };
}
