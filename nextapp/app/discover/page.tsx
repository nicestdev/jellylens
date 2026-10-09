"use client";

import { useState } from "react";
import { AlertCircle, Inbox, SearchX } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { POSTER_GRID, PosterGridSkeleton } from "@/components/poster-card";
import { useReleasesChanged } from "@/hooks/use-releases-changed";
import { ResultTile, itemKey, useDiscover, useRequests, useTileContext } from "@/components/request-tiles";

// TMDB search, or what's trending when the box is empty, as a poster
// grid; "+ Wishlist" puts a title on it. A title opens its
// releases for admins, its TMDB page for everyone else.
export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const r = useRequests();
  useReleasesChanged(() => void r.reload());
  const tileCtx = useTileContext(r);
  const discover = useDiscover(q);
  const error = r.error || discover.error;

  return (
    <main className="w-full max-w-[1440px] px-4 py-5 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold">Discover</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {q ? `TMDB results for “${q}”` : "Trending this week on TMDB. Search for anything else."}
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
          placeholder="Search movies and shows…"
          className="w-full sm:w-64"
        />
      </div>

      <div className="mt-6">
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
              <ResultTile
                key={itemKey(item)}
                item={item}
                requested={r.requestedKeys.has(itemKey(item))}
                ctx={tileCtx}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
