import {
  AUTH_ENABLED,
  JELLYFIN_URL,
  JELLYFIN_API_KEY,
  TMDB_API_KEY,
  JELLYFIN_SYNC_INTERVAL_HOURS,
  TMDB_SYNC_INTERVAL_HOURS,
  MISSING_RECHECK_INTERVAL_HOURS,
} from "@/lib/env";

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}********${key.slice(-4)}`;
}

// For the Settings page; admin only (see proxy.ts).
export async function GET() {
  return Response.json({
    jellyfinUrl: JELLYFIN_URL,
    jellyfinApiKey: maskKey(JELLYFIN_API_KEY),
    tmdbApiKey: maskKey(TMDB_API_KEY),
    authEnabled: AUTH_ENABLED,
    intervals: {
      jellyfin: JELLYFIN_SYNC_INTERVAL_HOURS,
      tmdb: TMDB_SYNC_INTERVAL_HOURS,
      missing: MISSING_RECHECK_INTERVAL_HOURS,
    },
  });
}
