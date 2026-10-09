import { DDOWNLOAD_LOGIN, DDOWNLOAD_PASSWORD, REALDEBRID_TOKEN } from "./env";

// Where the Downloads page fetches from: each link is turned into a direct
// download link, by a hoster's own account (only ddownload.com so far) or
// by Real-Debrid (see routeOf).
type Resolved = { url: string };
type Hoster = {
  name: string;
  ready: () => boolean; // its account is set up
  match: (url: string) => string | null;
  resolve: (code: string) => Promise<Resolved>;
};

// ddownload.com (also ddl.to), with a premium account. Its API's direct
// links only work for the account's own uploads, so downloads go through
// the website: sign in, open the file's page, send its download form, and
// the answer redirects to the file. Browsers get a Turnstile captcha on the
// sign-in form and on free downloads; download managers (a User-Agent with
// "JDownloader") get none, and a premium account's form needs none either.
const DDOWNLOAD = "https://ddownload.com";
const UA = "JDownloader";

// The signed-in session's cookies, kept between downloads, and a sign-in
// under way, which parallel downloads wait for instead of each signing in
// (see test/state.ts).
const g = globalThis as unknown as {
  __ddownloadCookies?: Map<string, string>;
  __ddownloadSignIn?: Promise<void> | null;
};
const jar = () => (g.__ddownloadCookies ??= new Map());
const cookieHeader = () => [...jar()].map(([k, v]) => `${k}=${v}`).join("; ");

async function ddownloadFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${DDOWNLOAD}${path}`, {
    ...init,
    redirect: "manual",
    headers: { "User-Agent": UA, Cookie: cookieHeader(), ...init.headers },
  });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const at = pair.indexOf("=");
    if (at > 0) jar().set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  return res;
}

// An HTML form's fields, by its name attribute.
function formFields(html: string, name: string): URLSearchParams | null {
  const form = new RegExp(`<form[^>]*name="${name}"[\\s\\S]*?</form>`, "i").exec(html)?.[0];
  if (!form) return null;
  const fields = new URLSearchParams();
  for (const [input] of form.matchAll(/<input[^>]*>/gi)) {
    const field = /name="([^"]+)"/i.exec(input)?.[1];
    if (field) fields.set(field, /value="([^"]*)"/i.exec(input)?.[1] ?? "");
  }
  return fields;
}

function signIn(): Promise<void> {
  g.__ddownloadSignIn ??= doSignIn().finally(() => {
    g.__ddownloadSignIn = null;
  });
  return g.__ddownloadSignIn;
}

async function doSignIn() {
  if (!DDOWNLOAD_LOGIN || !DDOWNLOAD_PASSWORD) throw new Error("DDOWNLOAD_LOGIN and DDOWNLOAD_PASSWORD aren't set");
  jar().clear();
  const page = await ddownloadFetch("/login");
  const fields = formFields(await page.text(), "FL") ?? new URLSearchParams({ op: "login", redirect: "" });
  fields.set("login", DDOWNLOAD_LOGIN);
  fields.set("password", DDOWNLOAD_PASSWORD);
  const res = await ddownloadFetch("/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: fields,
  });
  if (res.status >= 300 && res.status < 400 && jar().has("xfss")) return;
  const msg = /id="alertMsg">([^<]+)/.exec(await res.text())?.[1]?.trim();
  throw new Error(`ddownload sign-in failed${msg ? `: ${msg}` : ""}`);
}

// A redirect off ddownload's own pages is the file.
function fileRedirect(res: Response): string | null {
  const location = res.headers.get("location");
  if (!location || res.status < 300 || res.status >= 400) return null;
  const url = new URL(location, DDOWNLOAD);
  return /(^|\.)ddownload\.com$/i.test(url.hostname) ? null : url.href;
}

async function ddownloadLink(code: string, retried = false): Promise<string> {
  if (!jar().has("xfss")) await signIn();
  const page = await ddownloadFetch(`/${code}`);
  // Direct downloads turned on in the account: the page redirects right away.
  const direct = fileRedirect(page);
  if (direct) return direct;
  const html = await page.text();
  if (/>File Not Found<|>File Deleted</i.test(html)) throw new Error("ddownload: the file is gone");
  const fields = formFields(html, "F1");
  // No premium form: the session ran out (or isn't premium). Once more,
  // signed in afresh.
  if (!fields || fields.get("method_premium") !== "1") {
    if (retried) throw new Error("ddownload offers no premium download: is the account still premium?");
    await signIn();
    return ddownloadLink(code, true);
  }
  const res = await ddownloadFetch(`/${code}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${DDOWNLOAD}/${code}` },
    body: fields,
  });
  const link = fileRedirect(res);
  if (link) return link;
  const msg = /id="alertMsg">([^<]+)/.exec(await res.text())?.[1]?.trim();
  throw new Error(`ddownload gave no download link${msg ? `: ${msg}` : ` (HTTP ${res.status})`}`);
}

const ddownload: Hoster = {
  name: "ddownload",
  ready: () => Boolean(DDOWNLOAD_LOGIN && DDOWNLOAD_PASSWORD),
  match: (url) => /^https?:\/\/(?:www\.)?(?:ddownload\.com|ddl\.to)\/(?:f\/)?([a-z0-9]{12})\b/i.exec(url)?.[1] ?? null,
  resolve: async (code) => ({ url: await ddownloadLink(code) }),
};

// Hosters with an account of their own, used first.
const HOSTERS = [ddownload];

// Real-Debrid (a multi-hoster): one premium account that fetches from a few
// hundred hosters, for links on hosters there's no account of their own
// for. Its REST API with the private token from real-debrid.com/apitoken:
// /unrestrict/link turns a hoster's link into one of its own downloads.
const REALDEBRID_API = "https://api.real-debrid.com/rest/1.0";
const DOMAINS_TTL = 24 * 60 * 60 * 1000;

// Its hosters' domains (public, no token), kept a day (see test/state.ts).
const rd = globalThis as unknown as { __realDebridDomains?: { at: number; domains: Set<string> } };

async function realDebridDomains(): Promise<Set<string>> {
  const cached = rd.__realDebridDomains;
  if (cached && Date.now() - cached.at < DOMAINS_TTL) return cached.domains;
  const res = await fetch(`${REALDEBRID_API}/hosts/domains`);
  if (!res.ok) throw new Error(`Real-Debrid's hoster list answered HTTP ${res.status}`);
  const domains = new Set(((await res.json()) as string[]).map((d) => d.toLowerCase()));
  rd.__realDebridDomains = { at: Date.now(), domains };
  return domains;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

// The link's host if Real-Debrid fetches from it (a subdomain counts).
async function realDebridHost(url: string): Promise<string | null> {
  if (!REALDEBRID_TOKEN) return null;
  const host = hostOf(url);
  const domains = await realDebridDomains();
  const parts = host.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const domain = parts.slice(i).join(".");
    if (domains.has(domain)) return domain;
  }
  return null;
}

async function realDebridLink(url: string): Promise<string> {
  const res = await fetch(`${REALDEBRID_API}/unrestrict/link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REALDEBRID_TOKEN}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ link: url }),
  });
  const data = (await res.json().catch(() => ({}))) as { download?: string; error?: string; error_code?: number };
  if (data.download) return data.download;
  if (res.status === 401 || data.error_code === 8) throw new Error("Real-Debrid: REALDEBRID_TOKEN is wrong or expired");
  throw new Error(`Real-Debrid: ${data.error ?? `HTTP ${res.status}`}`);
}

// A link's file name before the hoster tells: the last part of its path
// (as it's written when it can't be decoded), else the link itself.
export function nameFromUrl(url: string): string {
  if (!URL.canParse(url)) return url;
  const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(last) || url;
  } catch {
    return last;
  }
}

// How a link is fetched: a hoster's own account first, else Real-Debrid if
// it covers the hoster. label: what the Downloads page shows ("ddownload",
// "rapidgator.net via Real-Debrid"). null: neither.
export type Route = { label: string; resolve: () => Promise<Resolved> };

export async function routeOf(url: string): Promise<Route | null> {
  for (const h of HOSTERS) {
    const code = h.match(url);
    if (code && h.ready()) return { label: h.name, resolve: () => h.resolve(code) };
  }
  const host = await realDebridHost(url);
  if (host) return { label: `${host} via Real-Debrid`, resolve: async () => ({ url: await realDebridLink(url) }) };
  return null;
}

// What a link is before it's downloaded: its file's name and size, or
// offline. Asked where it would be fetched from: ddownload's file page
// (no sign-in needed), else Real-Debrid's link check. null: no answer.
type LinkInfo = { online: true; name: string | null; size: number | null } | { online: false };

const UNITS: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };

async function ddownloadInfo(code: string): Promise<LinkInfo | null> {
  const res = await fetch(`${DDOWNLOAD}/${code}`, { headers: { "User-Agent": UA } });
  const html = await res.text();
  if (/>File Not Found<|>File Deleted<|file was removed/i.test(html)) return { online: false };
  const name = /class="dk-dl-name"[^>]*title="([^"]+)"/i.exec(html)?.[1] ?? null;
  const size = /class="dk-dl-size">\s*([\d.,]+)\s*(B|KB|MB|GB|TB)\s*</i.exec(html);
  if (!name && !size) return null;
  return {
    online: true,
    name,
    size: size ? Math.round(Number(size[1].replace(",", ".")) * UNITS[size[2].toUpperCase()]) : null,
  };
}

async function realDebridInfo(url: string): Promise<LinkInfo | null> {
  const res = await fetch(`${REALDEBRID_API}/unrestrict/check`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REALDEBRID_TOKEN}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ link: url }),
  });
  const data = (await res.json().catch(() => ({}))) as { filename?: string; filesize?: number; error_code?: number };
  if (data.error_code === 24 || res.status === 503) return { online: false }; // unavailable_file
  if (!data.filename && !data.filesize) return null;
  return { online: true, name: data.filename ?? null, size: data.filesize && data.filesize > 0 ? data.filesize : null };
}

export async function linkInfo(url: string): Promise<LinkInfo | null> {
  const code = ddownload.match(url);
  if (code) return ddownloadInfo(code);
  return (await realDebridHost(url)) ? realDebridInfo(url) : null;
}

export async function resolveLink(url: string): Promise<Resolved> {
  const route = await routeOf(url);
  if (!route)
    throw new Error(`No account for ${hostOf(url) || "this link"}, and Real-Debrid doesn't cover it (or isn't set up)`);
  return route.resolve();
}
