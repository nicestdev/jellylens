import { TMDB_API_KEY } from "./env";
import { TMDB_LANGUAGE } from "./env";
import { searchTmdbTitle } from "./tmdb";
import { parseReleaseName, sameTitle, withUmlauts } from "./title-match";
import { linkInfo } from "./hosters";
import { peekName } from "./archive-peek";
import { libraryOf } from "./download-library";
import { kickDownloads } from "./downloader";
import {
  getPackage,
  listFiles,
  listPackages,
  packagesToMatch,
  setInnerName,
  setPackageMedia,
  startPackage,
  updateFile,
  type DownloadMedia,
} from "./store";

// Looking a new package over: which movie or show it is (TMDB), and what
// its files are (the hoster; checkPendingFiles below).
//
// The movie or show a download package is, for its poster and title on
// the Queue: its name parsed like a release's ("Lanterns.S01.
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
  const language = TMDB_LANGUAGE;
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

// Packages not looked up yet, in the background (one at a time, deduped
// across calls; see test/state.ts). A failed search counts as looked up
// with nothing found, so it isn't asked again on every page load.
const g = globalThis as unknown as {
  __downloadMatching?: Promise<void> | null;
  __downloadChecking?: Promise<void> | null;
  __downloadChecked?: Map<number, number>;
  __downloadOnline?: Set<number>;
  __downloadPeeking?: Promise<void> | null;
  __downloadPeeked?: Set<number>;
};

export function matchPendingPackages() {
  if (g.__downloadMatching || !TMDB_API_KEY) return;
  const todo = packagesToMatch();
  if (!todo.length) return;
  g.__downloadMatching = (async () => {
    for (const pkg of todo) {
      setPackageMedia(pkg.id, await matchName(pkg.name).catch(() => null));
    }
  })().finally(() => {
    g.__downloadMatching = null;
  });
}

// Every file not started yet is asked about at the hoster once, like
// JDownloader's LinkGrabber: online (its name and size filled in where
// they're missing: pasted links, a container without sizes) or marked
// offline, so a new package shows what it holds and whether it can be
// had before it's started. In the background; a file the hoster didn't
// answer for is asked again after RECHECK_MS (see test/state.ts).
export const RECHECK_MS = 5 * 60 * 1000;

// What the hoster said about a file: online, or (asked, no answer yet)
// unknown; null if it hasn't been asked.
export function onlineOf(fileId: number): "online" | "unknown" | null {
  if (g.__downloadOnline?.has(fileId)) return "online";
  return g.__downloadChecked?.has(fileId) ? "unknown" : null;
}

const looksLikeLink = (name: string) => /^https?:\/\//i.test(name) || !/\.\w{2,4}$/.test(name);

// A new package's files the hoster is asked about at once, a few at a
// time, rather than by the check above: their names when they came only
// as links (a Rapidgator link is just an id), so what the library has of
// it can be told before it's started; offline ones fail. Whether every
// file now has a name.
async function nameFiles(packageId: number): Promise<boolean> {
  const checked = (g.__downloadChecked ??= new Map());
  const online = (g.__downloadOnline ??= new Set());
  const todo = listFiles(packageId).filter((f) => f.status === "queued" && looksLikeLink(f.name));
  for (let i = 0; i < todo.length; i += 4)
    await Promise.all(
      todo.slice(i, i + 4).map(async (f) => {
        checked.set(f.id, Date.now());
        const info = await linkInfo(f.url).catch(() => null);
        if (!info) return;
        if (!info.online) return updateFile(f.id, { status: "failed", error: "The hoster doesn't have it anymore" });
        online.add(f.id);
        updateFile(f.id, { size: f.size ?? info.size, ...(info.name ? { name: info.name } : {}) });
      }),
    );
  return listFiles(packageId).every((f) => f.status !== "queued" || !looksLikeLink(f.name));
}

// A new package started right away only when it's all new to the library
// (a movie it hasn't, a season it has nothing of), once its TMDB entry is
// known and every file's name tells; anything it has some of (a
// replacement, the rest of a season), or one matched to nothing, waits in
// Needs attention for a hand. Whether it was started.
export async function startIfNew(packageId: number): Promise<boolean> {
  if (!getPackage(packageId)?.media || !(await nameFiles(packageId))) return false;
  const files = listFiles(packageId);
  // A failed file (offline, no account for its hoster) would fail it once started.
  if (files.some((f) => f.status === "failed") || libraryOf(getPackage(packageId)!, files).library) return false;
  startPackage(packageId);
  kickDownloads();
  return true;
}

export function checkPendingFiles() {
  if (g.__downloadChecking) return;
  const checked = (g.__downloadChecked ??= new Map());
  const online = (g.__downloadOnline ??= new Set());
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
      !online.has(f.id) &&
      now - (checked.get(f.id) ?? -Infinity) >= RECHECK_MS,
  );
  if (!todo.length) return;
  g.__downloadChecking = (async () => {
    for (const f of todo) {
      checked.set(f.id, Date.now());
      const info = await linkInfo(f.url).catch(() => null);
      if (!info) continue;
      // As it is now: started (Start while the check went on), reset or
      // removed meanwhile, it's no longer this check's to write.
      const file = listFiles(f.packageId).find((x) => x.id === f.id);
      if (!file || file.status !== "queued" || file.received > 0) continue;
      if (!info.online) {
        updateFile(f.id, { status: "failed", error: "The hoster doesn't have it anymore" });
        continue;
      }
      online.add(f.id);
      updateFile(f.id, {
        size: file.size ?? info.size,
        ...(info.name && looksLikeLink(file.name) ? { name: info.name } : {}),
      });
    }
  })().finally(() => {
    g.__downloadChecking = null;
  });
}

// A release's name ("Ted.Lasso.S04E01.GERMAN.1080p.x265-GRP.part1.rar"), not
// an uploader's own abbreviation ("TeLa1080S04E01.rar"): dot-separated words.
const isReleaseName = (name: string) => /^[^.\s]+(\.[^.\s]+){3,}/.test(name);

// A new package whose archives aren't named like the release: its first
// archive's real file name is read once (archive-peek.ts), for what the
// library has of it (libraryOf). One at a time, in the background; one
// that gave nothing isn't tried again until a restart.
export function peekPendingPackages() {
  if (g.__downloadPeeking) return;
  const peeked = (g.__downloadPeeked ??= new Set());
  const todo = listPackages()
    .filter((p) => p.status === "pending" && !peeked.has(p.id))
    .flatMap((p) => {
      const first = listFiles(p.id)[0];
      return first &&
        first.status === "queued" &&
        !first.innerName &&
        !looksLikeLink(first.name) &&
        !isReleaseName(first.name)
        ? [first]
        : [];
    });
  if (!todo.length) return;
  g.__downloadPeeking = (async () => {
    for (const f of todo) {
      peeked.add(f.packageId);
      const name = await peekName(f.url).catch(() => null);
      if (name) setInnerName(f.id, name);
    }
  })().finally(() => {
    g.__downloadPeeking = null;
  });
}
