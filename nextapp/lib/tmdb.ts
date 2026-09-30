type TmdbShow = {
  seasons?: { season_number: number; episode_count?: number }[];
};

type TmdbSeasonEpisode = { air_date: string | null; episode_number: number };
type TmdbSeasonData = { episodes?: TmdbSeasonEpisode[] };

export async function fetchTmdbShow(apiKey: string, tmdbId: string): Promise<TmdbShow | null> {
  const res = await fetch(
    "https://api.themoviedb.org/3/tv/" + tmdbId + "?api_key=" + encodeURIComponent(apiKey)
  );
  if (!res.ok) return null;
  return res.json();
}

export async function fetchTmdbSeason(
  apiKey: string,
  tmdbId: string,
  seasonNumber: number
): Promise<TmdbSeasonData | null> {
  const res = await fetch(
    "https://api.themoviedb.org/3/tv/" +
      tmdbId +
      "/season/" +
      seasonNumber +
      "?api_key=" +
      encodeURIComponent(apiKey)
  );
  if (!res.ok) return null;
  return res.json();
}

type TmdbCollectionData = {
  name?: string;
  poster_path?: string | null;
  parts?: { id: number; media_type?: string; title?: string; release_date?: string; poster_path?: string | null }[];
};

// language is a TMDB locale ("de-DE") so part titles match the library's.
export async function fetchTmdbCollection(
  apiKey: string,
  collectionId: string,
  language: string
): Promise<TmdbCollectionData | null> {
  const qs = new URLSearchParams({ language, api_key: apiKey });
  const res = await fetch("https://api.themoviedb.org/3/collection/" + collectionId + "?" + qs);
  if (!res.ok) return null;
  return res.json();
}

// Runs fn over items with at most `limit` calls in flight at once.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// One movie or show from TMDB search/trending, trimmed to what the Requests
// page shows. People (search/multi also returns actors) are dropped, and so
// is anything without a poster: those are almost always obscure entries
// that only crowd out the one you're looking for.
export type TmdbResult = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  year: number | null;
  // Full first release / first air date, when TMDB has one.
  releaseDate: string | null;
  posterPath: string;
};

type TmdbRawResult = {
  media_type?: string;
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
};

function toResult(r: TmdbRawResult): TmdbResult | null {
  if (r.media_type !== "movie" && r.media_type !== "tv") return null;
  if (!r.poster_path) return null;
  const date = r.release_date || r.first_air_date || "";
  return {
    mediaType: r.media_type,
    tmdbId: r.id,
    title: r.title || r.name || "",
    year: date ? Number(date.slice(0, 4)) : null,
    releaseDate: date || null,
    posterPath: r.poster_path,
  };
}

async function fetchResults(apiKey: string, path: string, params: Record<string, string>): Promise<TmdbResult[]> {
  const qs = new URLSearchParams({ ...params, api_key: apiKey });
  const res = await fetch("https://api.themoviedb.org/3" + path + "?" + qs);
  if (!res.ok) throw new Error("TMDB returned HTTP " + res.status + " for " + path);
  const body = (await res.json()) as { results?: TmdbRawResult[] };
  return (body.results ?? []).map(toResult).filter((r): r is TmdbResult => r !== null);
}

// language is a TMDB locale ("de-DE") so titles match the library's.
export function searchTmdb(apiKey: string, query: string, language: string): Promise<TmdbResult[]> {
  return fetchResults(apiKey, "/search/multi", { query, language, include_adult: "false" });
}

// 20 per page; the caller filters out what's already owned, so it may want
// more than one page to fill a grid.
export function fetchTmdbTrending(apiKey: string, language: string, page = 1): Promise<TmdbResult[]> {
  return fetchResults(apiKey, "/trending/all/week", { language, page: String(page) });
}

// Earliest date (YYYY-MM-DD, possibly in the future) a movie reaches each
// kind of release. theatrical counts TMDB types 2-3 (limited, wide), not
// festival premieres; digital is type 4, physical (disc) type 5.
export type MovieReleases = { theatrical: string | null; digital: string | null; physical: string | null };

type RawReleaseDates = {
  results?: { iso_3166_1: string; release_dates: { type: number; release_date: string }[] }[];
};

// Only the given countries count, since pooling every country lets in junk
// (e.g. a "digital" date weeks before the film hit cinemas). Films with no
// entry for any of them (mostly foreign ones) fall back to all countries.
export async function fetchMovieReleases(
  apiKey: string,
  tmdbId: number,
  countries: string[]
): Promise<MovieReleases> {
  const res = await fetch(
    "https://api.themoviedb.org/3/movie/" + tmdbId + "/release_dates?api_key=" + encodeURIComponent(apiKey)
  );
  if (!res.ok) throw new Error("TMDB returned HTTP " + res.status + " for release dates of " + tmdbId);
  const all = ((await res.json()) as RawReleaseDates).results ?? [];
  const preferred = all.filter((c) => countries.includes(c.iso_3166_1));
  const releases: MovieReleases = { theatrical: null, digital: null, physical: null };
  for (const country of preferred.length ? preferred : all) {
    for (const d of country.release_dates) {
      const kind = d.type === 2 || d.type === 3 ? "theatrical" : d.type === 4 ? "digital" : d.type === 5 ? "physical" : null;
      const date = d.release_date.slice(0, 10);
      if (kind && (!releases[kind] || date < releases[kind])) releases[kind] = date;
    }
  }
  return releases;
}
