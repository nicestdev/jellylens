import { libraryCounts, missingCounts, syncedAt, tmdbCounts } from "@/lib/store";
import { releaseCounts } from "@/lib/store";
import { stageTriggers, type SyncStage } from "@/lib/sync-manager";
import type { StageStatus, StatusResponse } from "@/lib/api-types";

const stage = (name: SyncStage): StageStatus => ({
  syncedAt: syncedAt(name),
  running: stageTriggers[name].running(),
  error: stageTriggers[name].lastError(),
});

export async function GET() {
  const library = libraryCounts();
  const tmdb = tmdbCounts();
  const missing = missingCounts();
  const releases = releaseCounts();
  return Response.json({
    jellyfin: { ...stage("jellyfin"), movies: library.movies, shows: library.shows },
    tmdb: { ...stage("tmdb"), shows: tmdb.shows, collections: tmdb.collections },
    missing: {
      ...stage("missing"),
      incompleteCount: missing.series,
      incompleteCollectionCount: missing.collections,
      mismatchCount: missing.mismatches,
    },
    releases: { ...stage("releases"), groups: releases.groups, releases: releases.releases },
  } satisfies StatusResponse);
}
