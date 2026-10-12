// A title's page (app/title/[kind]/[id]): "/title/movie/949", "/title/tv/1399",
// or for an xREL title matched to nothing "/title/xrel/<title key>". Its key
// is the releases tile's on Discover ("movie:949", or the title key).

const TMDB_TILE = /^(movie|tv):(\d+)$/;

export function titlePath(key: string): string {
  const m = TMDB_TILE.exec(key);
  return m ? `/title/${m[1]}/${m[2]}` : `/title/xrel/${encodeURIComponent(key)}`;
}

// The other way round; null for a path that isn't one.
export function tileKeyOf(kind: string, id: string): string | null {
  if ((kind === "movie" || kind === "tv") && /^\d+$/.test(id)) return `${kind}:${id}`;
  if (kind === "xrel" && id) return decodeURIComponent(id);
  return null;
}
