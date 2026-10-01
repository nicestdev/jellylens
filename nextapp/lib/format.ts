// Text the pages show. UI copy is English; numbers and dates are formatted
// German-style (11.281, 30.09.2026).

// "1 show", "3 shows", "2 mismatches".
export function plural(n: number, word: string): string {
  return `${formatNumber(n)} ${word}${n === 1 ? "" : /(s|sh|ch|x|z)$/.test(word) ? "es" : "s"}`;
}

export const formatNumber = (n: number) => n.toLocaleString("de-DE");

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

export const seasonLabel = (season: number) => (season === 0 ? "Specials" : `Season ${season}`);
