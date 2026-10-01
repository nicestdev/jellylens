import type { CollectionsResponse } from "@/lib/api-types";
import { getMissingCollections, getPreferences, getTmdbCollections, groupsByTile } from "@/lib/store";

// Movie collections with released parts not in the library, for the
// Missing page's Movies card. Computed by the missing recheck. File names
// only go out when the admin turned them on in Settings. Each part you
// don't own says which favorite groups have released it.
export async function GET() {
  const { showFileNames } = getPreferences();
  const collections = getTmdbCollections();
  const missing = Object.entries(getMissingCollections());
  const released = groupsByTile(
    missing.flatMap(([, entry]) => entry.parts.filter((p) => !p.owned).map((p) => "movie:" + p.tmdbId))
  );
  const items = missing
    .map(([id, entry]) => {
      const collection = collections[id];
      const parts = entry.parts.map((p) => ({
        ...p,
        fileName: showFileNames ? p.fileName : undefined,
        releaseGroups: p.owned ? [] : (released.get("movie:" + p.tmdbId) ?? []),
      }));
      return { id, name: collection?.name ?? "", posterPath: collection?.posterPath ?? null, ...entry, parts };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ Items: items } satisfies CollectionsResponse);
}
