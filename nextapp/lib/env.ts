export const JELLYFIN_URL = (process.env.JELLYFIN_URL || "").replace(/\/+$/, "");
// Where the browser opens Jellyfin for "Open in Jellyfin" links. Only needed
// when JELLYFIN_URL isn't reachable from your devices (e.g. a Docker hostname).
export const JELLYFIN_PUBLIC_URL = (process.env.JELLYFIN_PUBLIC_URL || JELLYFIN_URL).replace(/\/+$/, "");
export const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY || "";
export const TMDB_API_KEY = process.env.TMDB_API_KEY || "";

// Hours between automatic runs of each sync stage; 0 turns that schedule off
// (manual "Sync now" only). Unset, empty or invalid values use the default.
function hours(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : fallback;
}
export const JELLYFIN_SYNC_INTERVAL_HOURS = hours("JELLYFIN_SYNC_INTERVAL_HOURS", 6);
export const TMDB_SYNC_INTERVAL_HOURS = hours("TMDB_SYNC_INTERVAL_HOURS", 24);
export const MISSING_RECHECK_INTERVAL_HOURS = hours("MISSING_RECHECK_INTERVAL_HOURS", 24);
