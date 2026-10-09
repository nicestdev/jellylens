export const JELLYFIN_URL = (process.env.JELLYFIN_URL || "").replace(/\/+$/, "");
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
export const XREL_SYNC_INTERVAL_HOURS = hours("XREL_SYNC_INTERVAL_HOURS", 6);

// Sign-in with Jellyfin accounts; on unless set to "false" (or 0/no/off).
// Off, Jellylens is open to anyone who can reach it, as a single admin.
export const AUTH_ENABLED = !/^(false|0|no|off)$/i.test(process.env.AUTH_ENABLED?.trim() ?? "");

export const WCX_URL = (process.env.WCX_URL || "").replace(/\/+$/, "");
export const WCX_API_URL = (process.env.WCX_API_URL || "").replace(/\/+$/, "");

export const DATA_DIR = process.env.DATA_DIR || "/app/data";

// Downloads (the Downloads page): the ddownload.com premium account it
// signs in with (lib/hosters.ts), a Real-Debrid token, the passwords tried on archives in turn
// (comma-separated), and where packages are downloaded and extracted.
export const DDOWNLOAD_LOGIN = process.env.DDOWNLOAD_LOGIN?.trim() || "";
export const DDOWNLOAD_PASSWORD = process.env.DDOWNLOAD_PASSWORD || "";
// Real-Debrid's private API token (real-debrid.com/apitoken): for links on
// hosters without an account of their own.
export const REALDEBRID_TOKEN = process.env.REALDEBRID_TOKEN?.trim() || "";
export const ARCHIVE_PASSWORDS = (process.env.ARCHIVE_PASSWORDS || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
export const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || `${DATA_DIR}/downloads`;
