import { jfGet } from "./jellyfin";
import { replaceJellyfin, type JellyfinEpisode, type JellyfinMovie, type JellyfinShow } from "./store";
import { storedFiles, type MediaFile, type MediaItem } from "./analytics";
import { audioLanguages } from "./languages";

// An item as Jellyfin's /Items lists it, only the fields we read. The rest
// (user data, blur hashes, every stream twice) is dropped at the sync.
type MediaStream = { Type?: string; Language?: string; Codec?: string; Width?: number; Height?: number };
type RawItem = {
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
  MediaSources?: { Path?: string; Size?: number; MediaStreams?: MediaStream[] }[];
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

// The name of the folder a file is in.
export function folderOf(filePath: string | undefined): string | undefined {
  return filePath?.replace(/\\/g, "/").split("/").slice(-2, -1)[0] || undefined;
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

// A movie's or episode's files for Analytics: one media source, and so one
// file, per version. Names and their folder's name only, never paths.
export function mediaFilesOf(raw: RawItem): MediaFile[] {
  return (raw.MediaSources ?? []).map(mediaFile);
}

function mediaFile(source: NonNullable<RawItem["MediaSources"]>[number]): MediaFile {
  const video = source.MediaStreams?.find((s) => s.Type === "Video");
  return {
    Name: fileNameOf(source.Path) ?? "",
    Folder: folderOf(source.Path),
    Size: source.Size ?? 0,
    Codec: video?.Codec?.toLowerCase() ?? "",
    Width: video?.Width,
    Height: video?.Height,
    Languages: audioLanguages(source.MediaStreams),
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
// The movies and episodes with their files, for Analytics. An episode
// carries its show's title, year and TMDB id.
export function mediaItems(movies: RawItem[], shows: RawItem[], episodes: RawItem[]): MediaItem[] {
  const showsById = new Map(shows.map((s) => [s.Id, s]));
  return [
    ...movies.map((m) => ({
      kind: "movie" as const,
      id: m.Id,
      parentId: m.Id,
      title: m.Name,
      year: m.ProductionYear ?? null,
      tmdbId: m.ProviderIds?.Tmdb ?? null,
      width: m.Width,
      height: m.Height,
      files: mediaFilesOf(m),
    })),
    ...episodes.map((e) => {
      const show = showsById.get(e.SeriesId ?? "");
      return {
        kind: "episode" as const,
        id: e.Id,
        parentId: e.SeriesId ?? "",
        title: show?.Name ?? "",
        year: show?.ProductionYear ?? null,
        tmdbId: show?.ProviderIds?.Tmdb ?? null,
        season: e.ParentIndexNumber ?? null,
        episode: e.IndexNumber ?? null,
        episodeEnd: e.IndexNumberEnd ?? null,
        episodeTitle: e.Name,
        files: mediaFilesOf(e),
      };
    }),
  ];
}

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
    jfGet<{ Items?: RawItem[] }>(
      jellyfinUrl,
      jellyfinApiKey,
      `/Users/${jellyfinUserId}/Items?Recursive=true&${query}`,
    ).then((res) => res.Items ?? []);

  const [movies, shows, episodes] = await Promise.all([
    items(
      "SortBy=SortName&SortOrder=Ascending&IncludeItemTypes=Movie&Fields=ProductionYear,MediaStreams,Width,Height,RunTimeTicks,ProviderIds,Path,Genres,MediaSources",
    ),
    items(
      "SortBy=SortName&SortOrder=Ascending&IncludeItemTypes=Series&Fields=ProductionYear,ProviderIds,ChildCount,RecursiveItemCount,Status,Genres",
    ),
    items("IncludeItemTypes=Episode&Fields=IndexNumber,IndexNumberEnd,ParentIndexNumber,SeriesId,MediaSources"),
  ]);

  const syncedAt = new Date().toISOString();
  const stored = { movies: movies.map(toMovie), shows: shows.map(toShow), episodes: episodes.map(toEpisode) };
  replaceJellyfin({ ...stored, files: storedFiles(mediaItems(movies, shows, episodes)) }, syncedAt);
  return { movies: movies.length, shows: shows.length, episodes: episodes.length, syncedAt };
}
