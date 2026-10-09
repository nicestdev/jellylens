import type {
  CollectionIgnore,
  CollectionItem,
  CollectionPartItem,
  EpisodeState,
  IgnoreEntry,
  IgnoreKind,
  MissingSeason,
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
type CollectionGroup = { collection: CollectionItem; parts: CollectionPartItem[] };
// gaps: in seasons that have finished airing; seasons: aired seasons you
// own none of; airing: in seasons still airing.
export type CategoryKey = "gaps" | "seasons" | "airing" | "movies" | "mismatch";
export type ShowCategory = Exclude<CategoryKey, "movies">;

// Ignored for that kind, either the season or the whole show (season null).
function isIgnored(ignored: ShowIgnore[], kind: IgnoreKind, seriesId: string, season: number): boolean {
  return ignored.some((e) => e.kind === kind && e.seriesId === seriesId && (e.season === null || e.season === season));
}

// Which of a show's seasons with missing episodes go on which card.
const SEASONS_OF: Record<Exclude<ShowCategory, "mismatch">, (s: MissingSeason) => boolean> = {
  gaps: (s) => s.ended && !s.wholeSeason,
  seasons: (s) => s.ended && s.wholeSeason,
  airing: (s) => !s.ended,
};

// A show's lines for one category, by season.
export function linesFor(item: ShowItem, key: ShowCategory): Line[] {
  if (key === "mismatch") {
    const m = item.Mismatches;
    if (!m) return [];
    return [
      ...m.extraSeasons.map((season) => ({ season, episodes: "", count: 1, extraSeason: true })),
      ...m.extraEpisodes.map((s) => ({ season: s.season, episodes: s.episodes, count: s.count })),
    ].sort((a, b) => a.season - b.season);
  }
  return (item.MissingEpisodes?.seasons ?? [])
    .filter(SEASONS_OF[key])
    .map((s) => ({ ...s, airing: !s.ended }))
    .sort((a, b) => a.season - b.season);
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

function isPartIgnored(ignored: CollectionIgnore[], collectionId: string, movieId: number): boolean {
  return ignored.some((e) => e.collectionId === collectionId && (e.movieId === null || e.movieId === movieId));
}

// A collection's parts that aren't owned, minus ignored ones.
function missingParts(c: CollectionItem, ignored: CollectionIgnore[]): CollectionPartItem[] {
  return c.parts.filter((p) => !p.owned && !isPartIgnored(ignored, c.id, p.tmdbId));
}

// Episodes (or issues) across the groups' lines.
function lineCount(groups: Group[]): number {
  return groups.reduce((sum, g) => sum + g.lines.reduce((s, l) => s + l.count, 0), 0);
}

// The cards of each category, what they add up to, and the ignored
// entries split by kind.
export function missingView(shows: ShowItem[], collections: CollectionItem[], ignored: IgnoreEntry[]) {
  const showIgnored = ignored.filter((e): e is ShowIgnore => e.kind !== "collection");
  const collectionIgnored = ignored.filter((e): e is CollectionIgnore => e.kind === "collection");

  const groupsOf = (key: ShowCategory): Group[] => {
    const kind: IgnoreKind = key === "mismatch" ? "mismatch" : "missing";
    return shows
      .map((item) => ({
        item,
        lines: linesFor(item, key).filter((l) => !isIgnored(showIgnored, kind, item.Id, l.season)),
      }))
      .filter((g) => g.lines.length > 0);
  };
  const showGroups: Record<ShowCategory, Group[]> = {
    gaps: groupsOf("gaps"),
    seasons: groupsOf("seasons"),
    airing: groupsOf("airing"),
    mismatch: groupsOf("mismatch"),
  };
  const collectionGroups: CollectionGroup[] = collections
    .map((collection) => ({ collection, parts: missingParts(collection, collectionIgnored) }))
    .filter((g) => g.parts.length > 0);

  const of = (groups: Group[]) => ({ count: lineCount(groups), groups: groups.length });
  const counts: Record<CategoryKey, { count: number; groups: number }> = {
    gaps: of(showGroups.gaps),
    seasons: of(showGroups.seasons),
    airing: of(showGroups.airing),
    movies: { count: collectionGroups.reduce((sum, g) => sum + g.parts.length, 0), groups: collectionGroups.length },
    mismatch: of(showGroups.mismatch),
  };
  return { showIgnored, collectionIgnored, showGroups, collectionGroups, counts };
}

// "12 episodes and 3 movies", or "Nothing".
export function summary(counts: Record<CategoryKey, { count: number }>): string {
  const episodes = counts.gaps.count + counts.seasons.count + counts.airing.count;
  const parts = [
    episodes ? plural(episodes, "episode") : null,
    counts.movies.count ? plural(counts.movies.count, "movie") : null,
  ];
  return parts.filter(Boolean).join(" and ") || "Nothing";
}
