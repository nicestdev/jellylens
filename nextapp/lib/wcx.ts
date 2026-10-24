import { releaseGroupOf } from "./analytics";
import { WCX_API_URL, WCX_URL } from "./env";
import { dottedName } from "./release-name";
import { parseReleaseName } from "./title-match";
import { sceneQuality, type Release } from "./xrel";

// An entry of WCX's latest list (its "Heute" page), only the fields we
// read. updated_at moves to now whenever a release is added to it, which
// puts it first; its releases come along, each with WCX's id.
export type WcxEntry = {
  uid: string;
  type: string; // movie, series
  updated_at: string;
  options?: { imdb_id?: string | null; tmdb_id?: number | string | null } | null;
  releases?: { id: number; fulltitle?: string | null }[] | null;
};
type WcxPage = { items: { data: WcxEntry[]; last_page: number } };

// What the WCX site itself sends, so a sync reads like someone browsing it
// (a browser's Referer to another host is the page's origin only).
const headers = (): Record<string, string> => ({
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  ...(WCX_URL ? { Origin: WCX_URL, Referer: WCX_URL + "/" } : {}),
});

export type WcxType = "movie" | "series";

// One page of the latest movies or shows, the newest first, asked for as
// the site's own list does it (WCX_URL/type/movie?page=2: its query as it
// is, sortOrder and sortBy swapped and all). remaining: calls left this
// minute (WCX allows 60).
export async function fetchLatest(
  type: WcxType,
  page: number,
): Promise<{ entries: WcxEntry[]; lastPage: number; remaining: number }> {
  const res = await fetch(
    `${WCX_API_URL}/start/search?__LOAD&per_page=21&page=${page}&types=${type}&sortOrder=latest&sortBy=desc`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error(`WCX answered HTTP ${res.status}`);
  const data: WcxPage = await res.json();
  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  return {
    entries: data.items.data,
    lastPage: data.items.last_page,
    remaining: Number.isFinite(remaining) ? remaining : 60,
  };
}

// An entry's releases in xREL's terms, all of one title (wcx:<uid>), each
// named as a release (dottedName: matching and the title page read title
// and year from it) and dated when the entry last changed: WCX's list has
// no date per release, and the title page reads the real ones from WCX
// anyway.
export function toReleases(e: WcxEntry): Release[] {
  const type = e.type === "series" ? "tv" : "movie";
  const publishedAt = Math.floor(Date.parse(e.updated_at) / 1000);
  return (e.releases ?? []).flatMap((r) => {
    const name = dottedName(r.fulltitle ?? "");
    if (!name) return [];
    return [
      {
        id: "wcx:" + r.id,
        name,
        link: WCX_URL ? `${WCX_URL}/detail/${e.uid}` : "",
        type,
        quality: sceneQuality(name),
        publishedAt,
        // A movie's split by the year in its names, as xREL's are (toRelease):
        // WCX too now and then files a remake under the original.
        titleKey: "wcx:" + e.uid + (type === "movie" && year(name) ? "~" + year(name) : ""),
        imdbId: e.options?.imdb_id || undefined,
        group: groupOf(name),
      },
    ];
  });
}

const year = (name: string) => parseReleaseName(name).year;

// The group at the end of a release name ("-GRP"); none without one, or
// for "p2p", which a name says when its uploader didn't know the group.
export function groupOf(name: string): string | undefined {
  const group = releaseGroupOf(name);
  return group && name.endsWith("-" + group) && group.toLowerCase() !== "p2p" ? group : undefined;
}
