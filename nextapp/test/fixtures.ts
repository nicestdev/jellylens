import type { JellyfinEpisode, JellyfinMovie, JellyfinShow } from "@/lib/store";

// Stored library items for tests: the required fields filled in, the rest
// as given.

export const movie = (over: Partial<JellyfinMovie> & { Id: string }): JellyfinMovie => ({
  Name: over.Id,
  ProviderIds: {},
  ImageTags: {},
  Genres: [],
  AudioLanguages: [],
  ...over,
});

export const show = (over: Partial<JellyfinShow> & { Id: string }): JellyfinShow => ({
  Name: over.Id,
  ProviderIds: {},
  ImageTags: {},
  Genres: [],
  ...over,
});

export const episode = (seriesId: string, season: number, n: number, end: number | null = null): JellyfinEpisode => ({
  Id: `${seriesId}-${season}-${n}`,
  SeriesId: seriesId,
  ParentIndexNumber: season,
  IndexNumber: n,
  IndexNumberEnd: end,
  Size: 0,
  AudioLanguages: [],
});
