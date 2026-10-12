import type { LibraryEpisode, LibraryMovie, LibraryShow } from "@/lib/store";

// Stored library items for tests: the required fields filled in, the rest
// as given.

export const movie = (over: Partial<LibraryMovie> & { id: string }): LibraryMovie => ({
  name: over.id,
  posterPath: null,
  disks: [],
  genres: [],
  audioLanguages: [],
  ...over,
});

export const show = (over: Partial<LibraryShow> & { id: string }): LibraryShow => ({
  name: over.id,
  posterPath: null,
  disks: [],
  genres: [],
  ...over,
});

export const episode = (showId: string, season: number, n: number, end: number | null = null): LibraryEpisode => ({
  id: `${showId}-${season}-${n}`,
  showId: showId,
  season,
  episode: n,
  episodeEnd: end,
  size: 0,
  audioLanguages: [],
});
