import type { CollectionsResponse } from "@/lib/api-types";
import { getMissingCollections, getPreferences, getTmdbCollections } from "@/lib/store";

// Movie collections with released parts not in the library, for the
// Missing page's Movies card. Computed by the missing recheck. File names
// only go out when the admin turned them on in Settings.
export async function GET() {
  const { showFileNames } = getPreferences();
  const collections = getTmdbCollections();
  const items = Object.entries(getMissingCollections())
    .map(([id, entry]) => {
      const collection = collections[id];
      const parts = showFileNames ? entry.parts : entry.parts.map((p) => ({ ...p, fileName: undefined }));
      return { id, name: collection?.name ?? "", posterPath: collection?.posterPath ?? null, ...entry, parts };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ Items: items } satisfies CollectionsResponse);
}
