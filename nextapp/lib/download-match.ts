import { TMDB_API_KEY } from "./env";
import { ensureMetadataLanguage } from "./sync-manager";
import { searchTmdbTitle } from "./tmdb";
import { parseReleaseName, sameTitle, withUmlauts } from "./title-match";
import { linkInfo } from "./hosters";
import { listFiles, listPackages, packagesToMatch, setPackageMedia, updateFile, type DownloadMedia } from "./store";

// Looking a new package over: which movie or show it is (TMDB), and what
// its files are (the hoster; checkPendingFiles below).
//
// The movie or show a download package is, for its poster and title on
// the Downloads page: its name parsed like a release's ("Lanterns.S01.
// GERMAN.…-w00t - thewooter": the uploader after " - " dropped), a show if
// it has a season, then a TMDB search by title and year. The best result
// whose title fits, else none; looked up once per package. Nothing found
// for a German name spelled without umlauts ("Auserwaehlten"): searched
// again with them, taking only a hit that fits.

// "Name - uploader" → "Name", and a range of seasons ("S01+S02",
// "S01-S03", "S01-03") as its first, which the name parser knows.
const releaseName = (name: string) =>
  name
    .replace(/\s+-\s+[^.]+$/, "")
    .trim()
    .replace(/\.S(\d{1,2})(?:[+-]S?\d{1,2})+(?=\.)/i, ".S$1");

const isShowName = (name: string) => /\.S\d{1,2}(E\d{1,3})?\./i.test(`${releaseName(name)}.`);

export async function matchName(name: string): Promise<DownloadMedia | null> {
  if (!TMDB_API_KEY) return null;
  const release = releaseName(name);
  const parsed = parseReleaseName(release);
  if (!parsed.title) return null;
  const type = isShowName(release) ? "tv" : "movie";
  const language = await ensureMetadataLanguage();
  // A show's year in a release name is rare and often the season's, not
  // the first air date: search without it if nothing fits with it.
  const years = parsed.year && type === "tv" ? [parsed.year, null] : [parsed.year];
  const umlauts = withUmlauts(parsed.title);
  for (const query of umlauts === parsed.title ? [parsed.title] : [parsed.title, umlauts]) {
    for (const year of years) {
      const results = await searchTmdbTitle(TMDB_API_KEY, type, query, year, language);
      const fits = results.find((r) => sameTitle(r.title, query) || sameTitle(r.originalTitle, query));
      const hit = fits ?? (query === parsed.title ? results[0] : undefined);
      if (hit) return { type, tmdbId: hit.tmdbId, title: hit.title, year: hit.year, posterPath: hit.posterPath };
    }
  }
  return null;
}

// When matchName last got better (umlauts). Packages it found nothing for
// before then get another search; move it on with the next improvement.
export const MATCHING_CHANGED = "2026-10-07T20:00:00.000Z";

// Packages not looked up yet, in the background (one at a time, deduped
// across calls; see test/state.ts). A failed search counts as looked up
// with nothing found, so it isn't asked again on every page load (only
// once more after MATCHING_CHANGED).
const g = globalThis as unknown as {
  __downloadMatching?: Promise<void> | null;
  __downloadChecking?: Promise<void> | null;
  __downloadChecked?: Map<number, number>;
};

export function matchPendingPackages() {
  if (g.__downloadMatching || !TMDB_API_KEY) return;
  const todo = packagesToMatch(MATCHING_CHANGED);
  if (!todo.length) return;
  g.__downloadMatching = (async () => {
    for (const pkg of todo) {
      setPackageMedia(pkg.id, await matchName(pkg.name).catch(() => null));
    }
  })().finally(() => {
    g.__downloadMatching = null;
  });
}

// Files not started yet whose size isn't known (pasted links, a container
// without sizes): their name and size from the hoster, or marked offline,
// so a new package shows what it holds before it's started. In the
// background; a file the hoster didn't answer for is asked again after
// RECHECK_MS (see test/state.ts).
export const RECHECK_MS = 5 * 60 * 1000;

const looksLikeLink = (name: string) => /^https?:\/\//i.test(name) || !/\.\w{2,4}$/.test(name);

export function checkPendingFiles() {
  if (g.__downloadChecking) return;
  const checked = (g.__downloadChecked ??= new Map());
  const now = Date.now();
  const open = new Set(
    listPackages()
      .filter((p) => p.status === "pending" || p.status === "queued")
      .map((p) => p.id),
  );
  const todo = listFiles().filter(
    (f) =>
      open.has(f.packageId) &&
      f.status === "queued" &&
      f.received === 0 &&
      f.size === null &&
      now - (checked.get(f.id) ?? -Infinity) >= RECHECK_MS,
  );
  if (!todo.length) return;
  g.__downloadChecking = (async () => {
    for (const f of todo) {
      checked.set(f.id, Date.now());
      const info = await linkInfo(f.url).catch(() => null);
      if (!info) continue;
      if (!info.online) updateFile(f.id, { status: "failed", error: "Offline: the hoster doesn't have it anymore" });
      else updateFile(f.id, { size: info.size, ...(info.name && looksLikeLink(f.name) ? { name: info.name } : {}) });
    }
  })().finally(() => {
    g.__downloadChecking = null;
  });
}
