import type { TitleRelease } from "./api-types";
import { seasonLabel } from "./format";
import { codecOf, episodesOf, tierOfRelease } from "./upgrades";

// A title's page (app/title/[kind]/[id]): "/title/movie/949", "/title/tv/1399",
// or for an xREL title matched to nothing "/title/xrel/<title key>". Its key
// is the Releases tile's ("movie:949", or the title key).

const TMDB_TILE = /^(movie|tv):(\d+)$/;

// What Upgrades opens it on: only the target group's releases, in the
// quality, codec and season of the row (each left out for any).
type TitleOnly = { group: string; tier?: string | null; codec?: string | null; season?: number | null };

export function titlePath(key: string, only?: TitleOnly): string {
  const m = TMDB_TILE.exec(key);
  const path = m ? `/title/${m[1]}/${m[2]}` : `/title/xrel/${encodeURIComponent(key)}`;
  if (!only) return path;
  const q = new URLSearchParams({ group: only.group });
  if (only.tier) q.set("tier", only.tier);
  if (only.codec) q.set("codec", only.codec);
  if (only.season != null) q.set("season", String(only.season));
  return `${path}?${q}`;
}

// The other way round; null for a path that isn't one.
export function tileKeyOf(kind: string, id: string): string | null {
  if ((kind === "movie" || kind === "tv") && /^\d+$/.test(id)) return `${kind}:${id}`;
  if (kind === "xrel" && id) return decodeURIComponent(id);
  return null;
}

// The ?group=&tier=&codec=&season= of an Upgrades link as a filter over
// the releases, with the line that says so; null without a group.
export function onlyFilter(params: URLSearchParams): { keep: (r: TitleRelease) => boolean; note: string } | null {
  const group = params.get("group");
  if (!group) return null;
  const tier = params.get("tier");
  const codec = params.get("codec");
  const seasonParam = params.get("season");
  const season = seasonParam === null ? null : Number(seasonParam);
  const kind = [tier, codec].filter(Boolean).join(" ");
  return {
    keep: (r) =>
      r.group.toLowerCase() === group.toLowerCase() &&
      (!tier || tierOfRelease(r.quality) === tier) &&
      (!codec || codecOf(r.name) === codec) &&
      (season === null || episodesOf(r.name)?.season === season),
    note: `Only ${group}'s ${kind ? kind + " " : ""}releases${season === null ? "" : ` of ${seasonLabel(season)}`}`,
  };
}
