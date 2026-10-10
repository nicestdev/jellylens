import type { LibraryEpisode, LibraryMovie, LibraryShow } from "@/lib/store";

// Stored library items for tests: the required fields filled in, the rest
// as given.

export const movie = (over: Partial<LibraryMovie> & { Id: string }): LibraryMovie => ({
  Name: over.Id,
  ProviderIds: {},
  PosterPath: null,
  Disks: [],
  Genres: [],
  AudioLanguages: [],
  ...over,
});

export const show = (over: Partial<LibraryShow> & { Id: string }): LibraryShow => ({
  Name: over.Id,
  ProviderIds: {},
  PosterPath: null,
  Disks: [],
  Genres: [],
  ...over,
});

export const episode = (seriesId: string, season: number, n: number, end: number | null = null): LibraryEpisode => ({
  Id: `${seriesId}-${season}-${n}`,
  SeriesId: seriesId,
  ParentIndexNumber: season,
  IndexNumber: n,
  IndexNumberEnd: end,
  Size: 0,
  AudioLanguages: [],
});
