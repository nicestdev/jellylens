"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Inbox, SearchX } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { POSTER_GRID, PosterGridSkeleton } from "@/components/poster-card";
import { useReleasesChanged } from "@/hooks/use-releases-changed";
import { matchesWords } from "@/lib/text";
import { WishlistTile, itemKey, useRequests, useTileContext } from "@/components/request-tiles";

// What's been requested: the user's own, or for admins everyone's with who
// asked; arrived ones first, then the most wanted. The search box filters
// it by title; a poster grid, like Discover. A title opens its releases for admins, its TMDB page for
// everyone else.
export default function WishlistPage() {
  const [query, setQuery] = useState("");
  const r = useRequests();
  useReleasesChanged(() => void r.reload());
  const ctx = useTileContext(r);
  const q = query.trim();
  const matches = matchesWords(q);
  const shown = r.requests.filter((item) => matches(item.title));
  const open = r.requests.length - r.availableCount;

  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold">Wishlist</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {r.loading
            ? "Loading…"
            : r.requests.length
              ? [`${open} open`, r.availableCount ? `${r.availableCount} now in your library` : null]
                  .filter(Boolean)
                  .join(" · ")
              : "Nothing on it yet."}
        </p>
      </div>

      {r.error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{r.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={r.overview ? "Search everyone's wishlists…" : "Search your wishlist…"}
          className="w-full sm:w-64"
        />
      </div>

      <div className="mt-6">
        {r.loading ? (
          <PosterGridSkeleton />
        ) : shown.length === 0 ? (
          q ? (
            <EmptyState
              icon={SearchX}
              title="Nothing found"
              hint={
                r.overview ? `Nothing on anyone's wishlist matches “${q}”.` : `Nothing on your wishlist matches “${q}”.`
              }
            />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <EmptyState
                icon={Inbox}
                title="Your wishlist is empty"
                hint="Find something under Discover and add it."
              />
              <Link href="/discover" className="text-sm text-primary transition-colors hover:text-foreground">
                Go to Discover
              </Link>
            </div>
          )
        ) : (
          <div className={POSTER_GRID}>
            {shown.map((item) => (
              <WishlistTile key={itemKey(item)} item={item} ctx={ctx} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
