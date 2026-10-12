import type { AnalyticsResponse } from "@/lib/api-types";
import {
  filesByAudio,
  filesByCodec,
  filesByGroup,
  filesByQuality,
  filesByResolution,
  libraryTotals,
} from "@/lib/store";

// GET /api/analytics — both libraries' totals and their files split by
// resolution, codec (also both together), audio mix and release group, for the Analytics page;
// admin only (see proxy.ts).
export async function GET() {
  return Response.json({
    movies: libraryTotals("movies"),
    shows: libraryTotals("shows"),
    resolutions: filesByResolution(),
    codecs: filesByCodec(),
    quality: filesByQuality(),
    audio: filesByAudio(),
    groups: filesByGroup(),
  } satisfies AnalyticsResponse);
}
