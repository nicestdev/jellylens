import type { AnalyticsResponse, LibraryAnalytics } from "@/lib/api-types";
import {
  fileSummary,
  filesByCodec,
  filesByGroup,
  filesByLanguage,
  filesByResolution,
  syncedAt,
  type Library,
} from "@/lib/store";

const totals = (library: Library): LibraryAnalytics => ({
  ...fileSummary(library),
  groups: filesByGroup(library),
  resolutions: filesByResolution(library),
  codecs: filesByCodec(library),
  languages: filesByLanguage(library),
});

// GET /api/analytics — the movies' and the episodes' files, sizes and their
// split by release group, resolution, codec and audio language, for the Analytics page's
// tiles and share charts; admin only (see proxy.ts). The files themselves
// are paged by /api/analytics/files.
export async function GET() {
  return Response.json({
    movies: totals("movies"),
    shows: totals("shows"),
    syncedAt: syncedAt("jellyfin"),
  } satisfies AnalyticsResponse);
}
