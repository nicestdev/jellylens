import { sleep } from "./async";

// TMDB's v3 API. language params are TMDB locales ("de-DE"), so titles match
// the library's metadata language.
const API = "https://api.themoviedb.org/3";

export class TmdbError extends Error {
  constructor(
    public status: number,
    path: string
  ) {
    super("TMDB returned HTTP " + status + " for " + path);
  }
}

// One GET. TMDB allows about 50 requests per second; a 429 is waited out
// (Retry-After, else a second) up to three times before it counts as a
// failure. Other errors throw a TmdbError with the status.
async function get<T>(apiKey: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = API + path + "?" + new URLSearchParams({ ...params, api_key: apiKey });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 3) {
      await sleep((Number(res.headers.get("retry-after")) || 1) * 1000);
      continue;
    }
    throw new TmdbError(res.status, path);
  }
}

// null when TMDB doesn't have it (404), which callers treat differently
// from a failed request: the entry is gone, not just unreachable.
async function getOrNull<T>(apiKey: string, path: string, params?: Record<string, string>): Promise<T | null> {
  try {
    return await get<T>(apiKey, path, params);
  } catch (e) {
    if (e instanceof TmdbError && e.status === 404) return null;
    throw e;
  }
}

// ---- Shows and collections, for the TMDB sync

export type TmdbShow = { seasons?: { season_number: number }[] };
export type TmdbSeasonData = { episodes?: { air_date: string | null; episode_number: number }[] };
export type TmdbCollectionData = {
  name?: string;
  poster_path?: string | null;
  parts?: { id: number; media_type?: string; title?: string; release_date?: string; poster_path?: string | null }[];
};

export const fetchTmdbShow = (apiKey: string, tmdbId: string) => getOrNull<TmdbShow>(apiKey, "/tv/" + tmdbId);
export const fetchTmdbSeason = (apiKey: string, tmdbId: string, season: number) =>
  getOrNull<TmdbSeasonData>(apiKey, "/tv/" + tmdbId + "/season/" + season);
export const fetchTmdbCollection = (apiKey: string, collectionId: string, language: string) =>
  getOrNull<TmdbCollectionData>(apiKey, "/collection/" + collectionId, { language });

// Earliest date (YYYY-MM-DD, possibly in the future) a movie reaches each
// kind of release. theatrical counts TMDB types 2-3 (limited, wide), not
// festival premieres; digital is type 4, physical (disc) type 5.
export type MovieReleases = { theatrical: string | null; digital: string | null; physical: string | null };

type RawReleaseDates = { results?: { iso_3166_1: string; release_dates: { type: number; release_date: string }[] }[] };

// The countries whose release dates count for a library in language
// ("de-DE"): its own plus the US, where digital releases land first.
export const releaseCountries = (language: string) => [...new Set([language.split("-")[1] ?? "US", "US"])];

const RELEASE_KIND: Record<number, keyof MovieReleases> = { 2: "theatrical", 3: "theatrical", 4: "digital", 5: "physical" };

// Only the given countries count, since pooling every country lets in junk
// (e.g. a "digital" date weeks before the film hit cinemas). Films with no
// entry for any of them (mostly foreign ones) fall back to all countries.
export function earliestReleases(raw: RawReleaseDates, countries: string[]): MovieReleases {
  const all = raw.results ?? [];
  const preferred = all.filter((c) => countries.includes(c.iso_3166_1));
  const releases: MovieReleases = { theatrical: null, digital: null, physical: null };
  for (const country of preferred.length ? preferred : all) {
    for (const d of country.release_dates) {
      const kind = RELEASE_KIND[d.type];
      const date = d.release_date.slice(0, 10);
      if (kind && (!releases[kind] || date < releases[kind])) releases[kind] = date;
    }
  }
  return releases;
}

export async function fetchMovieReleases(apiKey: string, tmdbId: number, countries: string[]): Promise<MovieReleases> {
  return earliestReleases(await get<RawReleaseDates>(apiKey, "/movie/" + tmdbId + "/release_dates"), countries);
}

// ---- Search and trending, for the Requests page

// One movie or show, trimmed to what the Requests page shows. People
// (search/multi also returns actors) are dropped, and so is anything
// without a poster: those are almost always obscure entries that only
// crowd out the one you're looking for.
export type TmdbResult = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  year: number | null;
  // Full first release / first air date, when TMDB has one.
  releaseDate: string | null;
  posterPath: string;
};

type RawResult = {
  media_type?: string;
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
};

const dateOf = (r: RawResult) => r.release_date || r.first_air_date || null;
const yearOf = (date: string | null) => (date ? Number(date.slice(0, 4)) : null);

export function toResult(r: RawResult): TmdbResult | null {
  if ((r.media_type !== "movie" && r.media_type !== "tv") || !r.poster_path) return null;
  const date = dateOf(r);
  return { mediaType: r.media_type, tmdbId: r.id, title: r.title || r.name || "", year: yearOf(date), releaseDate: date, posterPath: r.poster_path };
}

async function results(apiKey: string, path: string, params: Record<string, string>): Promise<TmdbResult[]> {
  const body = await get<{ results?: RawResult[] }>(apiKey, path, params);
  return (body.results ?? []).map(toResult).filter((r): r is TmdbResult => r !== null);
}

export const searchTmdb = (apiKey: string, query: string, language: string) =>
  results(apiKey, "/search/multi", { query, language, include_adult: "false" });

// 20 per page; the caller filters out what's already owned, so it may want
// more than one page to fill a grid.
export const fetchTmdbTrending = (apiKey: string, language: string, page = 1) =>
  results(apiKey, "/trending/all/week", { language, page: String(page) });

// ---- Matching releases (lib/title-match.ts)

// A movie or show from TMDB's find or search, for the Releases page.
export type TmdbFindResult = Omit<TmdbResult, "posterPath"> & { posterPath: string | null; originalTitle: string };

export function toFindResult(mediaType: "movie" | "tv", r: RawResult): TmdbFindResult {
  const date = dateOf(r);
  return {
    mediaType,
    tmdbId: r.id,
    title: r.title || r.name || "",
    originalTitle: r.original_title || r.original_name || "",
    year: yearOf(date),
    releaseDate: date,
    posterPath: r.poster_path || null,
  };
}

// The TMDB movie or show behind an IMDb id (xREL gives those), or null if
// TMDB doesn't know it. prefer: which kind to take when it lists both.
export async function findTmdbByImdb(
  apiKey: string,
  imdbId: string,
  language: string,
  prefer: "movie" | "tv"
): Promise<TmdbFindResult | null> {
  const body = await get<{ movie_results?: RawResult[]; tv_results?: RawResult[] }>(
    apiKey,
    "/find/" + encodeURIComponent(imdbId),
    { external_source: "imdb_id", language }
  );
  const found = { movie: body.movie_results?.[0], tv: body.tv_results?.[0] };
  const mediaType = found[prefer] ? prefer : prefer === "tv" ? "movie" : "tv";
  const hit = found[mediaType];
  return hit ? toFindResult(mediaType, hit) : null;
}

// TMDB's movie or show search, narrowed to a year when there is one, for
// releases whose xREL link didn't check out. Best matches first.
export async function searchTmdbTitle(
  apiKey: string,
  mediaType: "movie" | "tv",
  query: string,
  year: number | null,
  language: string
): Promise<TmdbFindResult[]> {
  const params: Record<string, string> = { query, language, include_adult: "false" };
  if (year) params[mediaType === "movie" ? "year" : "first_air_date_year"] = String(year);
  const body = await get<{ results?: RawResult[] }>(apiKey, "/search/" + mediaType, params);
  return (body.results ?? []).map((r) => toFindResult(mediaType, r));
}

type RawTitles = {
  alternative_titles?: { titles?: { title: string }[]; results?: { title: string }[] };
  translations?: { translations?: { data?: { title?: string; name?: string } }[] };
};

// Every other title TMDB knows a movie or show by: alternative titles and
// translations in all languages ("Poseidon Inferno" for The Poseidon
// Adventure). One call, for checking a release name against them. None for
// an entry TMDB has since removed.
export async function fetchTmdbTitles(apiKey: string, mediaType: "movie" | "tv", tmdbId: number): Promise<string[]> {
  const body = await getOrNull<RawTitles>(apiKey, "/" + mediaType + "/" + tmdbId, {
    append_to_response: "alternative_titles,translations",
  });
  if (!body) return [];
  // Movies list alternative titles under titles, shows under results.
  const alternative = body.alternative_titles?.titles ?? body.alternative_titles?.results ?? [];
  const translated = (body.translations?.translations ?? []).map((t) => t.data?.title || t.data?.name || "");
  return [...new Set([...alternative.map((t) => t.title), ...translated].filter(Boolean))];
}
