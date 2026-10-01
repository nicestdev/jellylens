import { jfGet } from "./jellyfin";
import { replaceJellyfin, type JellyfinEpisode, type JellyfinMovie, type JellyfinShow } from "./store";
import { audioLanguages } from "./languages";

// An item as Jellyfin's /Items lists it, only the fields we read. The rest
// (user data, blur hashes, every stream twice) is dropped at the sync.
type MediaStream = { Type?: string; Language?: string };
export type RawItem = {
  Id: string;
  Name: string;
  ServerId?: string;
  ProductionYear?: number;
  ProviderIds?: Record<string, string | undefined>;
  ImageTags?: { Primary?: string };
  Genres?: string[];
  Width?: number;
  Height?: number;
  RunTimeTicks?: number;
  Path?: string;
  MediaStreams?: MediaStream[];
  MediaSources?: { Size?: number; MediaStreams?: MediaStream[] }[];
  Status?: string;
  ChildCount?: number;
  RecursiveItemCount?: number;
  SeriesId?: string;
  ParentIndexNumber?: number | null;
  IndexNumber?: number | null;
  IndexNumberEnd?: number | null;
};

// A path's last part, whichever separator the server uses.
export function fileNameOf(filePath: unknown): string | undefined {
  if (typeof filePath !== "string" || !filePath) return undefined;
  return filePath.replace(/\\/g, "/").split("/").pop() || undefined;
}

function base(raw: RawItem) {
  return {
    Id: raw.Id,
    Name: raw.Name,
    ServerId: raw.ServerId,
    ProductionYear: raw.ProductionYear,
    ProviderIds: { Tmdb: raw.ProviderIds?.Tmdb, TmdbCollection: raw.ProviderIds?.TmdbCollection },
    ImageTags: { Primary: raw.ImageTags?.Primary },
    Genres: raw.Genres ?? [],
  };
}

// The file's name is kept (to match the release group on the Missing page),
// not where it lives on the server.
export function toMovie(raw: RawItem): JellyfinMovie {
  return {
    ...base(raw),
    Width: raw.Width,
    Height: raw.Height,
    RunTimeTicks: raw.RunTimeTicks,
    FileName: fileNameOf(raw.Path),
    AudioLanguages: audioLanguages(raw.MediaStreams),
  };
}

export function toShow(raw: RawItem): JellyfinShow {
  return { ...base(raw), Status: raw.Status, ChildCount: raw.ChildCount, RecursiveItemCount: raw.RecursiveItemCount };
}

export function toEpisode(raw: RawItem): JellyfinEpisode {
  const source = raw.MediaSources?.[0];
  return {
    Id: raw.Id,
    SeriesId: raw.SeriesId ?? "",
    ParentIndexNumber: raw.ParentIndexNumber ?? null,
    IndexNumber: raw.IndexNumber ?? null,
    IndexNumberEnd: raw.IndexNumberEnd ?? null,
    Size: source?.Size ?? 0,
    AudioLanguages: audioLanguages(source?.MediaStreams),
  };
}

// Pulls every movie, show and episode the admin user can see and replaces
// the stored library with them. Movies and shows come in Jellyfin's sort
// order.
export async function syncJellyfin({
  jellyfinUrl,
  jellyfinApiKey,
  jellyfinUserId,
}: {
  jellyfinUrl: string;
  jellyfinApiKey: string;
  jellyfinUserId: string;
}) {
  const items = (query: string) =>
    jfGet<{ Items?: RawItem[] }>(jellyfinUrl, jellyfinApiKey, `/Users/${jellyfinUserId}/Items?Recursive=true&${query}`).then(
      (res) => res.Items ?? []
    );

  const [movies, shows, episodes] = await Promise.all([
    items(
      "SortBy=SortName&SortOrder=Ascending&IncludeItemTypes=Movie&Fields=ProductionYear,MediaStreams,Width,Height,RunTimeTicks,ProviderIds,Path,Genres"
    ),
    items(
      "SortBy=SortName&SortOrder=Ascending&IncludeItemTypes=Series&Fields=ProductionYear,ProviderIds,ChildCount,RecursiveItemCount,Status,Genres"
    ),
    items("IncludeItemTypes=Episode&Fields=IndexNumber,IndexNumberEnd,ParentIndexNumber,SeriesId,MediaSources"),
  ]);

  const syncedAt = new Date().toISOString();
  replaceJellyfin({ movies: movies.map(toMovie), shows: shows.map(toShow), episodes: episodes.map(toEpisode) }, syncedAt);
  return { movies: movies.length, shows: shows.length, episodes: episodes.length, syncedAt };
}
