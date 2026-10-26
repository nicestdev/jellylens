import { DLOAD_URL as BASE, DLOAD_USER, DLOAD_PASSWORD } from "./env";
import { sleep } from "./async";
import { log } from "./log";
import { findTmdbByImdb, searchTmdbTitle } from "./tmdb";
import { withUmlauts } from "./title-match";
import { dottedName } from "./release-name";
import { sceneQuality, type Release } from "./xrel";

// DLoad (DLOAD_URL, a XenForo forum): the threads an uploader opened
// (dload_users, by forum user id), read from the forum's search as a
// signed-in member would (DLOAD_USER/PASSWORD; a thread's IMDb link
// shows only signed in). No API: the pages' HTML.

const headers = (referer: string, cookie: string): Record<string, string> => ({
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "de-DE,de;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Referer: referer,
  Cookie: cookie,
});

// The session's cookies by name, in memory (a restart signs in again).
const globalForDload = globalThis as unknown as { __jellylensDload?: Map<string, string> };
const jar = () => (globalForDload.__jellylensDload ??= new Map());
const cookieHeader = () => [...jar()].map(([k, v]) => `${k}=${v}`).join("; ");
function keepCookies(res: Response) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const at = pair.indexOf("=");
    jar().set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}

// Signs in as a member would: the form's page (its token and the forum's
// cookies), a pause, then the form with "stay signed in".
async function signIn() {
  if (!BASE || !DLOAD_USER || !DLOAD_PASSWORD)
    throw new Error("DLOAD_URL, DLOAD_USER and DLOAD_PASSWORD are not configured.");
  jar().clear();
  const form = await fetch(`${BASE}/login/`, { headers: headers(BASE + "/", "") });
  keepCookies(form);
  const token = /name="_xfToken" value="([^"]+)"/.exec(await form.text())?.[1];
  if (!form.ok || !token) throw new Error(`DLoad's sign-in page answered HTTP ${form.status}`);
  await sleep(3000 + Math.random() * 4000);
  const res = await fetch(`${BASE}/login/login`, {
    method: "POST",
    redirect: "manual",
    headers: { ...headers(`${BASE}/login/`, cookieHeader()), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      _xfToken: token,
      login: DLOAD_USER,
      password: DLOAD_PASSWORD,
      remember: "1",
      _xfRedirect: BASE + "/",
    }),
  });
  keepCookies(res);
  if (!jar().has("xf_user")) throw new Error(`DLoad didn't sign in ${DLOAD_USER} (HTTP ${res.status})`);
  log.info("dload", `Signed in as ${DLOAD_USER}`);
}

const signedIn = (html: string) => html.includes('data-logged-in="true"');

// A page as the member sees it: signed in first if there's no session
// yet, and again once if the page came back signed out (it expired).
async function getPage(url: string, referer: string): Promise<{ html: string; url: string }> {
  if (!jar().has("xf_user")) await signIn();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: headers(referer, cookieHeader()) });
    if (!res.ok) throw new Error(`DLoad answered HTTP ${res.status}`);
    keepCookies(res);
    const html = await res.text();
    if (signedIn(html) || attempt) return { html, url: res.url };
    log.info("dload", "Signed out, signing in again");
    await signIn();
  }
}

export const threadUrl = (id: number) => `${BASE}/threads/${id}/`;

// A thread as one of Discover's releases, of its uploader's group: all of a
// TMDB title's threads are one title (dload:movie:949), its match known
// already (matchDloadTitles in lib/sync-dload.ts).
export function toRelease(
  t: { id: number; title: string; postedAt: string; type: "movie" | "tv"; tmdbId: number },
  group: string | undefined,
): Release {
  const name = dottedName(t.title);
  return {
    id: "dload:" + t.id,
    name,
    link: threadUrl(t.id),
    type: t.type,
    quality: sceneQuality(name),
    publishedAt: Math.floor(Date.parse(t.postedAt) / 1000),
    titleKey: `dload:${t.type}:${t.tmdbId}`,
    group,
  };
}

// A hit in the search's list: its thread's id and title as it is now (the
// release name with spaces: "Tulsa King 2022 S04 GERMAN AAC 1080p WEB x265
// - w00t"), and when the thread was opened, or the post written.
export type DloadHit = { id: number; title: string; postedAt: string };

const unescape = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

export function parseSearchPage(html: string): DloadHit[] {
  return html
    .split('<li class="block-row')
    .slice(1)
    .flatMap((row) => {
      const id = /href="\/threads\/[^"/]*?\.?(\d+)\/(?:post-\d+)?"/.exec(row)?.[1];
      const title = /<h3 class="contentRow-title">\s*<a[^>]*>([\s\S]*?)<\/a>/.exec(row)?.[1];
      const time = /data-time="(\d+)"/.exec(row)?.[1];
      return id && title && time
        ? [{ id: Number(id), title: unescape(title), postedAt: new Date(Number(time) * 1000).toISOString() }]
        : [];
    });
}

// The threads a user opened (threads), or every post they wrote (posts:
// new episodes, upgrades), newest first, page by page (20 a page). page 1
// starts a search; the next pages go on with its id. An old id makes
// XenForo start a new search from page 1, so a page that came back as
// another search's is asked for again on that one.
export async function fetchSearchPage(userId: number, of: "threads" | "posts", page: number, searchUrl: string | null) {
  if (page === 1 || !searchUrl) {
    const content = of === "threads" ? "&content=thread" : "";
    const first = await getPage(`${BASE}/search/member?user_id=${userId}${content}`, BASE + "/");
    return { hits: parseSearchPage(first.html), searchUrl: first.url };
  }
  const at = (url: string) => url.replace(/[?&]page=\d+/, "").replace(/\?/, `?page=${page}&`);
  let res = await getPage(at(searchUrl), searchUrl);
  if (!res.url.includes(`page=${page}`)) res = await getPage(at(res.url), res.url);
  return { hits: parseSearchPage(res.html), searchUrl: res.url };
}

// The IMDb id in a thread's first post ("Infos zum Release": a link
// labelled with the rating), null if there's none.
export async function fetchThreadImdb(id: number, referer: string): Promise<string | null> {
  const { html } = await getPage(threadUrl(id), referer);
  // The first post's article ("message-body" articles are inside it).
  const first = html.split('<article class="message message--post')[1] ?? "";
  return /imdb\.com\/(?:[a-z]{2}\/)?title\/(tt\d+)/.exec(first)?.[1] ?? null;
}

// A thread's title as title, year and seasons: "Arrow 2012 S01-S08 GERMAN
// …" → Arrow, 2012, [1…8]; "Babylon Berlin S05 GERMAN …" → no year.
// release: false for what isn't one (no "GERMAN": software and such).
export type ThreadTitle = { title: string; year: number | null; seasons: number[]; release: boolean };

const TAGS = /(\s+(DIRECTORS CUT|DC|EXTENDED|UNCUT|UNRATED|THEATRICAL|REMASTERED|IMAX))+$/i;

export function parseThreadTitle(thread: string): ThreadTitle {
  const name = thread.replace(/\s+-\s+\S+$/, "");
  const at = name.search(/\sGERMAN\b/);
  if (at < 0) return { title: name, year: null, seasons: [], release: false };
  let head = name.slice(0, at).replace(TAGS, "");
  let seasons: number[] = [];
  const s = /\s+S(\d{1,2})(?:[-+]S?(\d{1,2}))?\b.*$/i.exec(head);
  if (s) {
    const from = Number(s[1]);
    const to = s[2] ? Number(s[2]) : from;
    seasons = Array.from({ length: Math.max(1, to - from + 1) }, (_, i) => from + i);
    head = head.slice(0, s.index);
  }
  head = head.replace(TAGS, "");
  const y = /^(.+?)\s+((?:19|20)\d\d)$/.exec(head);
  return { title: (y ? y[1] : head).replace(TAGS, "").trim(), year: y ? Number(y[2]) : null, seasons, release: true };
}

// Spelled the same: case, accents, umlauts written out, "&"/"und" and
// punctuation aside ("Mrs. Doubtfire" = "Mrs Doubtfire").
export const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "und")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/ss/g, "s")
    .replace(/[^a-z0-9]/g, "");

// The TMDB id a title surely is: exactly one result of its year spelled
// the same (on its German or original title). Null when it isn't sure: no
// year, none, or more than one.
export async function sureTmdbId(
  apiKey: string,
  language: string,
  type: "movie" | "tv",
  t: ThreadTitle,
): Promise<number | null> {
  if (!t.year) return null;
  const want = fold(t.title);
  const umlauts = withUmlauts(t.title);
  for (const query of umlauts === t.title ? [t.title] : [t.title, umlauts]) {
    const results = await searchTmdbTitle(apiKey, type, query, t.year, language);
    const fits = results.filter((r) => r.year === t.year && (fold(r.title) === want || fold(r.originalTitle) === want));
    if (fits.length === 1) return fits[0].tmdbId;
    if (fits.length > 1) return null;
  }
  return null;
}

// The TMDB id behind a thread's IMDb id, null if TMDB doesn't know it, or
// if it's of another year than the thread's (±1): uploaders link the wrong one
// now and then (w00t's "Rambo 5: Last Blood (2019)" to Rambo, 2008).
export async function tmdbOfImdb(
  apiKey: string,
  language: string,
  imdbId: string,
  type: "movie" | "tv",
  year: number | null,
) {
  const hit = await findTmdbByImdb(apiKey, imdbId, language, type);
  if (!hit || (year && hit.year && Math.abs(hit.year - year) > 1)) return null;
  return { type: hit.mediaType, tmdbId: hit.tmdbId };
}
