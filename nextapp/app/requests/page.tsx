"use client";

import { useState } from "react";
import { AlertCircle, Inbox, SearchX } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { POSTER_GRID, PosterGridSkeleton } from "@/components/poster-card";
import { EveryoneTile, RequestTile, ResultTile, itemKey, useDiscover, useRequests } from "@/components/request-tiles";
import { cn } from "@/lib/utils";

type Tab = "discover" | "requests" | "everyone";

const TAB_LABEL: Record<Tab, string> = { discover: "Discover", requests: "Requests", everyone: "Everyone" };
const SEARCH_PLACEHOLDER: Record<Tab, string> = {
  discover: "Search movies and shows…",
  requests: "Search your requests…",
  everyone: "Search all requests…",
};

// Tabs: Discover (TMDB search, or trending when the box is empty), the
// user's own requests, and for admins everyone's. The one search box serves
// all of them — on a list tab it just filters the list by title.
export default function RequestsPage() {
  const [tab, setTab] = useState<Tab>("discover");
  const [query, setQuery] = useState("");
  const q = query.trim();
  const r = useRequests();
  const discover = useDiscover(tab === "discover" ? q : "");
  const error = r.error || discover.error;
  const tabs: Tab[] = r.everyone ? ["discover", "requests", "everyone"] : ["discover", "requests"];
  const tabCount: Partial<Record<Tab, number>> = { requests: r.requests.length, everyone: r.everyone?.length };

  const needle = q.toLowerCase();
  const matching = <T extends { title: string }>(items: T[]) =>
    needle ? items.filter((item) => item.title.toLowerCase().includes(needle)) : items;
  const shownRequests = matching(r.requests);
  const shownEveryone = matching(r.everyone ?? []);

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
        <SearchInput value={query} onChange={setQuery} placeholder={SEARCH_PLACEHOLDER[tab]} className="w-full sm:w-80" />
        {/* Full width with equal parts on phones, where it gets its own line; compact and right-aligned from sm up. */}
        <div className="flex h-8 w-full items-center rounded-lg border bg-card p-0.5 text-sm sm:ml-auto sm:w-auto">
          {tabs.map((t) => (
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
              {TAB_LABEL[t]}
              {tabCount[t] ? (
                <span className="rounded-sm bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
                  {tabCount[t]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {tab === "everyone" ? (
          r.loading ? (
            <PosterGridSkeleton />
          ) : shownEveryone.length === 0 ? (
            q ? (
              <EmptyState icon={SearchX} title="No matching requests" hint={`No request matches “${q}”.`} />
            ) : (
              <EmptyState icon={Inbox} title="No requests yet" hint="Nobody has requested anything so far." />
            )
          ) : (
            <div className={POSTER_GRID}>
              {shownEveryone.map((item) => (
                <EveryoneTile key={itemKey(item)} item={item} ctx={r} />
              ))}
            </div>
          )
        ) : tab === "requests" ? (
          r.loading ? (
            <PosterGridSkeleton />
          ) : shownRequests.length === 0 ? (
            q ? (
              <EmptyState icon={SearchX} title="No matching requests" hint={`None of your requests match “${q}”.`} />
            ) : (
              <EmptyState icon={Inbox} title="No requests yet" hint="Find something under Discover and tap + to request it." />
            )
          ) : (
            <div className={POSTER_GRID}>
              {shownRequests.map((item) => (
                <RequestTile key={itemKey(item)} item={item} ctx={r} />
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
                  <ResultTile key={itemKey(item)} item={item} requested={r.requestedKeys.has(itemKey(item))} ctx={r} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
