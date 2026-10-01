import type {
  CollectionIgnore,
  CollectionItem,
  CollectionPartItem,
  EpisodeState,
  IgnoreEntry,
  IgnoreKind,
  ShowIgnore,
  ShowItem,
} from "@/lib/api-types";
import { plural } from "@/lib/format";

// What the Missing page shows, worked out from /api/shows, /api/collections
// and /api/ignored: the cards per category with their counts, minus what's
// ignored. No React here, so it's tested on its own (logic.test.ts).

// One season line on a show card. extraSeason = a whole season TMDB
// doesn't list at all (mismatches only). airing = the season is still
// airing, so the gaps may just mean you're not caught up yet.
export type Line = {
  season: number;
  episodes: string;
  count: number;
  total?: number;
  episodeStates?: EpisodeState[];
  wholeSeason?: boolean;
  extraSeason?: boolean;
  airing?: boolean;
};
export type Group = { item: ShowItem; lines: Line[] };
export type CollectionGroup = { collection: CollectionItem; parts: CollectionPartItem[] };
export type CategoryKey = "shows" | "movies" | "mismatch";

// Ignored for that kind, either the season or the whole show (season null).
export function isIgnored(ignored: ShowIgnore[], kind: IgnoreKind, seriesId: string, season: number): boolean {
  return ignored.some((e) => e.kind === kind && e.seriesId === seriesId && (e.season === null || e.season === season));
}

// A show's lines for one category. Missing: finished seasons first, those
// are the real gaps.
export function linesFor(item: ShowItem, key: "shows" | "mismatch"): Line[] {
  if (key === "mismatch") {
    const m = item.Mismatches;
    if (!m) return [];
    return [
      ...m.extraSeasons.map((season) => ({ season, episodes: "", count: 1, extraSeason: true })),
      ...m.extraEpisodes.map((s) => ({ season: s.season, episodes: s.episodes, count: s.count })),
    ].sort((a, b) => a.season - b.season);
  }
  return (item.MissingEpisodes?.seasons ?? [])
    .map((s) => ({ ...s, airing: !s.ended }))
    .sort((a, b) => Number(a.airing) - Number(b.airing) || a.season - b.season);
}

// "5-7, 9" -> "E5–7, E9"
export function episodeRanges(episodes: string): string {
  return episodes
    .split(", ")
    .map((part) => `E${part.replace("-", "–")}`)
    .join(", ");
}

// A line's text where there's no per-episode strip (mismatches).
export function lineText(line: Line): string {
  if (line.extraSeason) return "Not on TMDB";
  if (line.wholeSeason) return "Entire season";
  return episodeRanges(line.episodes);
}

export function isPartIgnored(ignored: CollectionIgnore[], collectionId: string, movieId: number): boolean {
  return ignored.some((e) => e.collectionId === collectionId && (e.movieId === null || e.movieId === movieId));
}

// A collection's parts that aren't owned, minus ignored ones.
export function missingParts(c: CollectionItem, ignored: CollectionIgnore[]): CollectionPartItem[] {
  return c.parts.filter((p) => !p.owned && !isPartIgnored(ignored, c.id, p.tmdbId));
}

// Episodes (or issues) across the groups' lines; airing: only those of
// seasons still airing (true) or finished (false).
export function lineCount(groups: Group[], airing?: boolean): number {
  return groups.reduce(
    (sum, g) => sum + g.lines.reduce((s, l) => s + (airing === undefined || l.airing === airing ? l.count : 0), 0),
    0
  );
}

// The cards of each category, what they add up to, and the ignored
// entries split by kind.
export function missingView(shows: ShowItem[], collections: CollectionItem[], ignored: IgnoreEntry[]) {
  const showIgnored = ignored.filter((e): e is ShowIgnore => e.kind !== "collection");
  const collectionIgnored = ignored.filter((e): e is CollectionIgnore => e.kind === "collection");

  const groupsOf = (key: "shows" | "mismatch", kind: IgnoreKind): Group[] =>
    shows
      .map((item) => ({ item, lines: linesFor(item, key).filter((l) => !isIgnored(showIgnored, kind, item.Id, l.season)) }))
      .filter((g) => g.lines.length > 0);
  const missingShows = groupsOf("shows", "missing");
  const mismatches = groupsOf("mismatch", "mismatch");
  const collectionGroups: CollectionGroup[] = collections
    .map((collection) => ({ collection, parts: missingParts(collection, collectionIgnored) }))
    .filter((g) => g.parts.length > 0);

  const counts: Record<CategoryKey, { count: number; groups: number }> = {
    shows: { count: lineCount(missingShows), groups: missingShows.length },
    movies: { count: collectionGroups.reduce((sum, g) => sum + g.parts.length, 0), groups: collectionGroups.length },
    mismatch: { count: lineCount(mismatches), groups: mismatches.length },
  };
  return {
    showIgnored,
    collectionIgnored,
    missingShows,
    mismatches,
    collectionGroups,
    counts,
    airingCount: lineCount(missingShows, true),
  };
}

// "12 episodes and 3 movies", or "Nothing".
export function summary(counts: Record<CategoryKey, { count: number }>): string {
  const parts = [
    counts.shows.count ? plural(counts.shows.count, "episode") : null,
    counts.movies.count ? plural(counts.movies.count, "movie") : null,
  ];
  return parts.filter(Boolean).join(" and ") || "Nothing";
}
