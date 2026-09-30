export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    // The session ran out while the page was open: sign in, then come back.
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      window.location.replace("/login?next=" + encodeURIComponent(location.pathname + location.search));
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request to ${path} failed (HTTP ${res.status})`);
  }
  return res.json();
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export type SyncStatus = {
  jellyfin: { syncedAt: string | null; movies: number; shows: number };
  tmdb: { syncedAt: string | null; shows: number; collections: number };
  missing: { syncedAt: string | null; incompleteCount: number; incompleteCollectionCount: number };
  mismatches: { syncedAt: string | null; mismatchCount: number };
};

export function formatStatusLine(status: SyncStatus): string {
  return (
    `Jellyfin ${relativeTime(status.jellyfin.syncedAt)} · ` +
    `TMDB ${relativeTime(status.tmdb.syncedAt)} · ` +
    `Missing ${relativeTime(status.missing.syncedAt)}`
  );
}

export type MediaItem = {
  Id: string;
  Name: string;
  ServerId?: string;
  ProductionYear?: number;
  CommunityRating?: number;
  ProviderIds?: { Tmdb?: string };
  [key: string]: unknown;
};

// Every title links to its TMDB page — never to Jellyfin, which usually
// isn't reachable from where Jellylens is opened. No TMDB id, no link.
export function tmdbUrl(type: "movie" | "tv" | "collection", tmdbId: string | number | undefined): string | undefined {
  return tmdbId ? `https://www.themoviedb.org/${type}/${tmdbId}` : undefined;
}
