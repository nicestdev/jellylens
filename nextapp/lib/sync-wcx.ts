import { insertReleases, setSyncedAt, setWcxUid, syncedAt } from "./store";
import { sleep } from "./async";
import { matchNewTitles } from "./sync-releases";
import { fetchLatest, toReleases, type WcxEntry, type WcxType } from "./wcx";
import { log } from "./log";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Room for the server's and WCX's clocks to differ; what's read twice is
// stored once.
const OVERLAP_MS = 10 * 60 * 1000;
const MAX_PAGES = 300; // per list
const PER_PAGE = 21; // as the site's own list

// A pause between pages like someone reading one before the next: 4–20 s,
// a minute when WCX's calls for this minute run low.
const pagePause = (remaining: number) => sleep(remaining < 5 ? 60_000 : 4000 + Math.random() * 16_000);

// WCX answers 500 for a whole page when one entry on it is broken (one
// without a cover, since 2026-11): that page read again one entry at a
// time, the broken ones left out, so a sync isn't stuck on it for good.
async function pageOneByOne(type: WcxType, page: number) {
  const entries: WcxEntry[] = [];
  let lastPage = page;
  let remaining = 60;
  for (let i = 1; i <= PER_PAGE; i++) {
    await sleep(remaining < 5 ? 60_000 : 1000 + Math.random() * 2000);
    try {
      const one = await fetchLatest(type, (page - 1) * PER_PAGE + i, 1);
      entries.push(...one.entries);
      lastPage = Math.ceil(one.lastPage / PER_PAGE);
      remaining = one.remaining;
    } catch (e) {
      if ((e as { status?: number }).status !== 500) throw e;
      log.warn("wcx", `Left out a broken entry WCX can't show (${type}s page ${page}, #${i})`);
    }
  }
  return { entries, lastPage, remaining };
}

// WCX's latest movies, then its latest shows (two lists on the site):
// each page by page, newest first, until an
// entry that last changed before the last sync started (the first sync
// goes a week back). Its releases go to Discover as WCX's (no favorite
// group), its uid to the title page's WCX lookup, and new titles are
// checked on TMDB like xREL's. A sync cut off keeps what it has; the next
// one starts from the last that finished, so nothing in between is missed.
export async function syncWcx({ tmdbApiKey, language }: { tmdbApiKey: string; language: string }) {
  const startedAt = new Date().toISOString();
  const last = syncedAt("wcx");
  const since = (last ? Date.parse(last) : Date.now() - WEEK_MS) - OVERLAP_MS;
  let added = 0;
  let pages = 0;
  let remaining = 60;
  let caughtUp = true;
  for (const type of ["movie", "series"] as WcxType[])
    for (let page = 1; ; page++) {
      // Cut off: what's left unread comes with the next sync, from the same point.
      if (page > MAX_PAGES) {
        log.warn("wcx", `Stopped at ${MAX_PAGES} pages of ${type}s, the rest comes with the next sync`);
        caughtUp = false;
        break;
      }
      if (pages > 0) await pagePause(remaining);
      const latest = await fetchLatest(type, page, PER_PAGE).catch((e) => {
        if ((e as { status?: number }).status !== 500) throw e;
        return pageOneByOne(type, page);
      });
      const { entries, lastPage } = latest;
      remaining = latest.remaining;
      if (remaining < 5) log.warn("wcx", `${remaining} calls left this minute, waiting a minute`);
      pages++;
      const fresh = entries.filter((e) => Date.parse(e.updated_at) >= since);
      for (const e of fresh) {
        const tmdbId = Number(e.options?.tmdb_id);
        if (tmdbId) setWcxUid(`${e.type === "series" ? "tv" : "movie"}:${tmdbId}`, e.uid);
      }
      added += insertReleases(null, fresh.flatMap(toReleases)).added;
      if (fresh.length < entries.length || page >= lastPage) break;
    }
  await matchNewTitles(tmdbApiKey, language);
  if (caughtUp) setSyncedAt("wcx", startedAt);
  return { pages, added, callsLeft: remaining };
}
