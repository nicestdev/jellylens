import type { StatusResponse, SyncStageName } from "./api-types";

// The browser side of the API: fetch helpers and formatting shared by the
// pages. Response types are in lib/api-types.ts.

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

// Starts a sync stage and waits until it's done, asking /api/status every
// couple of seconds (the route itself answers right away, see
// app/api/sync/[stage]). Throws the stage's error if it failed.
export async function runSync(stage: SyncStageName, pollMs = 2000): Promise<void> {
  await apiFetch(`/api/sync/${stage}`, { method: "POST" });
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const status = (await apiFetch<StatusResponse>("/api/status"))[stage];
    if (status.running) continue;
    if (status.error) throw new Error(status.error);
    return;
  }
}

// Every title links to its TMDB page — never to Jellyfin, which usually
// isn't reachable from where Jellylens is opened. No TMDB id, no link.
export function tmdbUrl(type: "movie" | "tv" | "collection", tmdbId: string | number | undefined): string | undefined {
  return tmdbId ? `https://www.themoviedb.org/${type}/${tmdbId}` : undefined;
}

// A TMDB poster path ("/abc.jpg") as served through Jellylens' own cache
// (app/api/tmdb-image), so the browser never loads from TMDB directly.
export function tmdbImage(path: string | null | undefined, size: "w185" | "w342" = "w342"): string | null {
  return path ? `/api/tmdb-image/${size}${path}` : null;
}
