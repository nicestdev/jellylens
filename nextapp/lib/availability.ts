import { fetchMovieReleases, releaseCountries, type MovieReleases } from "./tmdb";
import { mapWithConcurrency } from "./async";
import { releaseWindow } from "./dates";

// Why something isn't home-watchable yet — shown on the Requests page only
// when it's an exception. upcoming: nothing released; cinema: in theaters
// but no stream or disc yet; digital: streaming but no disc yet. next is the
// next relevant date, when TMDB has one. null = fully out (or owned).
type NextRelease = { kind: "Cinema" | "Digital" | "Blu-ray" | "Out" | "Starts"; date: string };
export type Availability = { status: "upcoming" | "cinema" | "digital"; next: NextRelease | null } | null;

function earliest(candidates: { kind: NextRelease["kind"]; date: string | null }[]): NextRelease | null {
  let best: NextRelease | null = null;
  for (const c of candidates) if (c.date && (!best || c.date < best.date)) best = { kind: c.kind, date: c.date };
  return best;
}

// TMDB often lacks digital/disc entries for older or obscure films, so a
// theatrical or digital release more than a year back is taken as "fully
// out" rather than flagged — home releases normally follow within months.
export function movieAvailability(
  r: MovieReleases,
  releaseDate: string | null,
  today: string,
  yearAgo: string
): Availability {
  const out = (d: string | null) => Boolean(d && d <= today);
  const soon = (d: string | null) => (d && d > today ? d : null);
  if (out(r.physical)) return null;
  if (out(r.digital)) {
    if (r.digital! < yearAgo) return null;
    return { status: "digital", next: earliest([{ kind: "Blu-ray", date: soon(r.physical) }]) };
  }
  if (out(r.theatrical)) {
    if (r.theatrical! < yearAgo) return null;
    return {
      status: "cinema",
      next: earliest([{ kind: "Digital", date: soon(r.digital) }, { kind: "Blu-ray", date: soon(r.physical) }]),
    };
  }
  if (r.theatrical || r.digital || r.physical) {
    return {
      status: "upcoming",
      next: earliest([
        { kind: "Cinema", date: r.theatrical },
        { kind: "Digital", date: r.digital },
        { kind: "Blu-ray", date: r.physical },
      ]),
    };
  }
  // No typed release dates at all: go by the plain release date. Without
  // one either, it's usually still in development.
  if (out(releaseDate)) return null;
  return { status: "upcoming", next: earliest([{ kind: "Out", date: releaseDate }]) };
}

// TMDB has no digital/disc data for TV; a show is simply out once it premiered.
export function showAvailability(firstAirDate: string | null, today: string): Availability {
  if (firstAirDate && firstAirDate <= today) return null;
  return { status: "upcoming", next: firstAirDate ? { kind: "Starts", date: firstAirDate } : null };
}

const RELEASES_TTL_MS = 12 * 60 * 60 * 1000;
// Release dates rarely change, and one search can mean 20 lookups, so keep
// them in memory for a while (on globalThis, so it survives dev reloads and tests can reset it).
const globalForReleases = globalThis as unknown as { __movieReleases?: Map<number, { at: number; value: MovieReleases }> };
const releasesCache = () => (globalForReleases.__movieReleases ??= new Map());

async function cachedMovieReleases(apiKey: string, tmdbId: number, countries: string[]): Promise<MovieReleases | null> {
  const hit = releasesCache().get(tmdbId);
  if (hit && Date.now() - hit.at < RELEASES_TTL_MS) return hit.value;
  try {
    const value = await fetchMovieReleases(apiKey, tmdbId, countries);
    releasesCache().set(tmdbId, { at: Date.now(), value });
    return value;
  } catch {
    return null; // not cached, so the next load retries
  }
}

type Rated = { mediaType: "movie" | "tv"; tmdbId: number; releaseDate?: string | null; library: unknown };

// Adds availability to each item that isn't already owned.
export async function withAvailability<T extends Rated>(
  items: T[],
  apiKey: string,
  language: string
): Promise<(T & { availability: Availability })[]> {
  const { today, yearAgo } = releaseWindow();
  const countries = releaseCountries(language);
  return mapWithConcurrency(items, 8, async (item) => {
    if (item.library) return { ...item, availability: null };
    const releaseDate = item.releaseDate ?? null;
    if (item.mediaType === "tv") return { ...item, availability: showAvailability(releaseDate, today) };
    const releases = await cachedMovieReleases(apiKey, item.tmdbId, countries);
    return { ...item, availability: releases ? movieAvailability(releases, releaseDate, today, yearAgo) : null };
  });
}
