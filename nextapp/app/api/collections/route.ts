import { store } from "@/lib/store";

// Movie collections with released parts not in the library, for the
// Missing page's Movies card. Computed by the missing recheck. File names
// only go out when the admin turned them on in Settings.
export async function GET() {
  const { showFileNames } = store.preferences;
  const items = Object.entries(store.missing.byCollectionId)
    .map(([id, entry]) => {
      const collection = store.tmdb.byCollectionId[id];
      const parts = showFileNames ? entry.parts : entry.parts.map((p) => ({ ...p, fileName: undefined }));
      return { id, name: collection?.name ?? "", posterPath: collection?.posterPath ?? null, ...entry, parts };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ Items: items });
}
