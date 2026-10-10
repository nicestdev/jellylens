// Text the pages show. UI copy is English; numbers have a decimal point and
// no thousands separator (11281, 4.21), dates are German-style (30.09.2026).

// "1 show", "3 shows", "2 mismatches".
export function plural(n: number, word: string): string {
  return `${formatNumber(n)} ${word}${n === 1 ? "" : /(s|sh|ch|x|z)$/.test(word) ? "es" : "s"}`;
}

// Every number the pages show: "11281", "4.21".
export const formatNumber = (n: number, options?: Intl.NumberFormatOptions) =>
  n.toLocaleString("en-US", { useGrouping: false, ...options });

// xREL and WCX give sizes in MB (binary).
export const MB = 1024 * 1024;

// Bytes in binary units, as file managers show them, always with two
// decimals: "512.00 MB", "45.60 GB", "1.23 TB" (plain bytes have none).
// The next unit from 1000 on, so it's never four digits ("0.98 GB", not
// "1010.00 MB") and columns of sizes stay narrow. A narrow no-break space
// before the unit: in Geist Mono a plain one is as wide as a digit.
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 ? 0 : 2;
  return `${formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits })}\u202f${units[unit]}`;
}

// A unix timestamp (seconds) as "30.09.2026".
export const formatDate = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

// "just now", "5m ago", "3h ago", "2d ago"; "never" for null.
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// A video's size as the badge and filters name it: "4K", "1080p", "720p",
// "SD"; "" when Jellyfin doesn't know. By width or height, so cropped
// films still count.
export function resolutionLabel(width?: number, height?: number): string {
  const w = width || 0,
    h = height || 0;
  if (!w && !h) return "";
  if (w >= 3800 || h >= 2100) return "4K";
  if (w >= 1900 || h >= 1060) return "1080p";
  if (w >= 1260 || h >= 700) return "720p";
  return "SD";
}

const two = (n: number) => String(n).padStart(2, "0");

// "S01"; "S01–S03" for a range.
export const seasonCode = (season: number, to = season) =>
  to === season ? `S${two(season)}` : `S${two(season)}–S${two(to)}`;

// "S01E02", "S01E02-E03"; "" without numbers.
export function episodeCode(
  season: number | null | undefined,
  episode: number | null | undefined,
  end?: number | null,
) {
  if (season == null || episode == null) return "";
  return `S${two(season)}E${two(episode)}` + (end != null && end !== episode ? `-E${two(end)}` : "");
}

export const seasonLabel = (season: number) => (season === 0 ? "Specials" : `Season ${season}`);
