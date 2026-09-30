import { jfGet } from "./jellyfin";
import { save, type Store, type JellyfinItem, type JellyfinEpisode } from "./store";
import { audioLanguages } from "./languages";

type ItemsResponse = { Items?: JellyfinItem[] };

// Scene/P2P release filenames conventionally end in "-GROUP" (or, less
// commonly, wrap it in brackets); this is a best-effort heuristic, not a
// guaranteed parse — Jellyfin doesn't expose the release group as its own field.
function fileNameOf(filePath: unknown): string | undefined {
  if (typeof filePath !== "string" || !filePath) return undefined;
  return filePath.replace(/\\/g, "/").split("/").pop() || undefined;
}

function parseReleaseGroup(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  const stem = fileName.replace(/\.[a-zA-Z0-9]{2,4}$/, "");

  const bracket = stem.match(/\[([A-Za-z0-9][A-Za-z0-9. _-]{1,23})\]\s*$/);
  if (bracket) return bracket[1].trim();

  const dash = stem.match(/-([A-Za-z0-9]{2,24})$/);
  if (dash && !/^\d+$/.test(dash[1])) return dash[1];

  return undefined;
}

export async function syncJellyfin(
  store: Store,
  {
    jellyfinUrl,
    jellyfinApiKey,
    jellyfinUserId,
  }: { jellyfinUrl: string; jellyfinApiKey: string; jellyfinUserId: string }
) {
  const basePath = "/Users/" + jellyfinUserId + "/Items?Recursive=true&SortBy=SortName&SortOrder=Ascending";

  const [moviesRes, showsRes, episodesRes] = await Promise.all([
    jfGet<ItemsResponse>(
      jellyfinUrl,
      jellyfinApiKey,
      basePath +
        "&IncludeItemTypes=Movie&Fields=ProductionYear,MediaStreams,Width,Height,RunTimeTicks,ProviderIds,CommunityRating,MediaSources,Path,Genres"
    ),
    jfGet<ItemsResponse>(
      jellyfinUrl,
      jellyfinApiKey,
      basePath + "&IncludeItemTypes=Series&Fields=ProductionYear,ProviderIds,ChildCount,RecursiveItemCount,Status,CommunityRating,Genres"
    ),
    jfGet<ItemsResponse>(
      jellyfinUrl,
      jellyfinApiKey,
      "/Users/" +
        jellyfinUserId +
        "/Items?Recursive=true&IncludeItemTypes=Episode&Fields=IndexNumber,IndexNumberEnd,ParentIndexNumber,SeriesId,MediaSources"
    ),
  ]);

  // Flatten Size out of MediaSources (which always drags in a duplicate nested
  // MediaStreams array) and drop the rest so the persisted cache stays lean.
  store.jellyfin.movies = (moviesRes.Items ?? []).map((movie) => {
    const mediaSources = movie.MediaSources as { Size?: number }[] | undefined;
    const size = mediaSources?.[0]?.Size ?? 0;
    // Only the file name is kept, not where it lives on the server.
    const fileName = fileNameOf(movie.Path);
    const clean: JellyfinItem = { ...movie, Size: size, FileName: fileName, ReleaseGroup: parseReleaseGroup(fileName) };
    delete clean.MediaSources;
    delete clean.Path;
    return clean;
  });

  store.jellyfin.shows = showsRes.Items ?? [];

  store.jellyfin.episodes = (episodesRes.Items ?? []).map((ep): JellyfinEpisode => {
    const mediaSources = ep.MediaSources as
      | { Size?: number; MediaStreams?: { Type?: string; Language?: string }[] }[]
      | undefined;
    return {
      Id: ep.Id,
      SeriesId: ep.SeriesId as string,
      ParentIndexNumber: (ep.ParentIndexNumber as number | null) ?? null,
      IndexNumber: (ep.IndexNumber as number | null) ?? null,
      IndexNumberEnd: (ep.IndexNumberEnd as number | null) ?? null,
      Size: mediaSources?.[0]?.Size ?? 0,
      AudioLanguages: audioLanguages(mediaSources?.[0]?.MediaStreams),
    };
  });

  store.jellyfin.syncedAt = new Date().toISOString();
  save();

  return {
    movies: store.jellyfin.movies.length,
    shows: store.jellyfin.shows.length,
    episodes: store.jellyfin.episodes.length,
    syncedAt: store.jellyfin.syncedAt,
  };
}
