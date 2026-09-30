import { store } from "@/lib/store";

export async function GET() {
  return Response.json({
    jellyfin: {
      syncedAt: store.jellyfin.syncedAt,
      movies: store.jellyfin.movies.length,
      shows: store.jellyfin.shows.length,
    },
    tmdb: {
      syncedAt: store.tmdb.syncedAt,
      shows: Object.keys(store.tmdb.bySeriesId).length,
      collections: Object.keys(store.tmdb.byCollectionId).length,
    },
    missing: {
      syncedAt: store.missing.syncedAt,
      incompleteCount: Object.keys(store.missing.bySeriesId).length,
      incompleteCollectionCount: Object.keys(store.missing.byCollectionId).length,
    },
    mismatches: {
      syncedAt: store.mismatches.syncedAt,
      mismatchCount: Object.keys(store.mismatches.bySeriesId).length,
    },
  });
}
