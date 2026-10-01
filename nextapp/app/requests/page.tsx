"use client";

import { useState } from "react";
import { AlertCircle, Inbox, SearchX } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { POSTER_GRID, PosterGridSkeleton } from "@/components/poster-card";
import { ReleasePanel, type PanelTitle } from "@/components/release-panel";
import { RequestTile, ResultTile, itemKey, useDiscover, useRequests, type Result } from "@/components/request-tiles";
import { cn } from "@/lib/utils";

type Tab = "discover" | "requests";

// Two tabs: Discover (TMDB search, or trending when the box is empty) and
// the requests — the user's own, or for admins everyone's, with who asked.
// The one search box serves both — on the requests tab it just filters the
// list by title. Switching tabs clears it, so each tab starts out whole
// (Discover with what's trending).
export default function RequestsPage() {
  const [tab, setTabState] = useState<Tab>("discover");
  const [query, setQuery] = useState("");
  const setTab = (t: Tab) => {
    if (t !== tab) setQuery("");
    setTabState(t);
  };
  const q = query.trim();
  const r = useRequests();
  // The releases panel a poster opens, for admins (everyone else's link to
  // TMDB: the releases are admin only).
  const [releases, setReleases] = useState<PanelTitle | null>(null);
  const showReleases = (item: Result) =>
    setReleases({
      key: itemKey(item),
      title: item.title,
      year: item.year,
      posterPath: item.posterPath,
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
    });
  const tileCtx = { ...r, showReleases: r.admin ? showReleases : undefined };
  const discover = useDiscover(tab === "discover" ? q : "");
  const error = r.error || discover.error;

  const needle = q.toLowerCase();
  const shownRequests = needle ? r.requests.filter((item) => item.title.toLowerCase().includes(needle)) : r.requests;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {r.loading
            ? "Loading…"
            : r.requests.length
              ? [
                  `${r.requests.length - r.availableCount} requested`,
                  r.availableCount ? `${r.availableCount} now in your library` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Search TMDB for something you want in the library."}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={tab === "discover" ? "Search movies and shows…" : r.overview ? "Search all requests…" : "Search your requests…"}
          className="w-full sm:w-80"
        />
        {/* Full width with equal halves on phones, where it gets its own line; compact and right-aligned from sm up. */}
        <div className="flex h-8 w-full items-center rounded-lg border bg-card p-0.5 text-sm sm:ml-auto sm:w-auto">
          {(["discover", "requests"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={cn(
                "flex h-full flex-1 items-center justify-center gap-1.5 rounded-md px-3 transition-colors sm:flex-none",
                tab === t ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "discover" ? "Discover" : "Requested"}
              {t === "requests" && r.requests.length ? (
                <span className="rounded-sm bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
                  {r.requests.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {tab === "requests" ? (
          r.loading ? (
            <PosterGridSkeleton />
          ) : shownRequests.length === 0 ? (
            q ? (
              <EmptyState
                icon={SearchX}
                title="No matching requests"
                hint={r.overview ? `No request matches “${q}”.` : `None of your requests match “${q}”.`}
              />
            ) : (
              <EmptyState icon={Inbox} title="No requests yet" hint="Find something under Discover and tap + to request it." />
            )
          ) : (
            <div className={POSTER_GRID}>
              {shownRequests.map((item) => (
                <RequestTile key={itemKey(item)} item={item} ctx={tileCtx} />
              ))}
            </div>
          )
        ) : (
          <>
            {!q ? <h2 className="mb-3 text-sm font-medium text-muted-foreground">Trending this week</h2> : null}
            {discover.loading ? (
              <PosterGridSkeleton />
            ) : discover.items.length === 0 ? (
              q ? (
                <EmptyState icon={SearchX} title="Nothing found" hint={`TMDB has no movie or show matching “${q}”.`} />
              ) : (
                <EmptyState icon={Inbox} title="Nothing trending" hint="Search for a movie or show instead." />
              )
            ) : (
              <div className={POSTER_GRID}>
                {discover.items.map((item) => (
                  <ResultTile key={itemKey(item)} item={item} requested={r.requestedKeys.has(itemKey(item))} ctx={tileCtx} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <ReleasePanel title={releases} onClose={() => setReleases(null)} onChanged={() => void r.reload()} />
    </main>
  );
}
