import type { ConfigResponse } from "@/lib/api-types";
import {
  AUTH_ENABLED,
  JELLYFIN_URL,
  JELLYFIN_API_KEY,
  TMDB_API_KEY,
  TMDB_LANGUAGE,
  LIBRARY_SCAN_INTERVAL_HOURS,
  TMDB_SYNC_INTERVAL_HOURS,
  MISSING_RECHECK_INTERVAL_HOURS,
  XREL_SYNC_INTERVAL_HOURS,
  DDOWNLOAD_LOGIN,
  DDOWNLOAD_PASSWORD,
  REALDEBRID_TOKEN,
  ARCHIVE_PASSWORDS,
  DOWNLOAD_DIR,
} from "@/lib/env";
import { getDownloadSettings, MAX_DOWNLOAD_SLOTS } from "@/lib/store";

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
    tmdbLanguage: TMDB_LANGUAGE,
    authEnabled: AUTH_ENABLED,
    ddownloadLogin: DDOWNLOAD_LOGIN,
    // Never any of its characters, nor its length.
    ddownloadPassword: DDOWNLOAD_PASSWORD ? "********" : "",
    realDebridToken: maskKey(REALDEBRID_TOKEN),
    archivePasswords: ARCHIVE_PASSWORDS.length,
    downloadDir: DOWNLOAD_DIR,
    intervals: {
      library: LIBRARY_SCAN_INTERVAL_HOURS,
      tmdb: TMDB_SYNC_INTERVAL_HOURS,
      missing: MISSING_RECHECK_INTERVAL_HOURS,
      releases: XREL_SYNC_INTERVAL_HOURS,
    },
    downloadSlots: getDownloadSettings().slots,
    passwords: getDownloadSettings().passwords,
    maxDownloadSlots: MAX_DOWNLOAD_SLOTS,
  } satisfies ConfigResponse);
}
