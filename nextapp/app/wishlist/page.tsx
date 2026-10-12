"use client";

import { useState } from "react";
import { Inbox, SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FacetMenu, FilterChips } from "@/components/filter-menu";
import { PageTools } from "@/components/page-tools";
import { SearchInput } from "@/components/search-input";
import { SortMenu } from "@/components/sort-menu";
import { POSTER_GRID, PosterGridSkeleton } from "@/components/poster-card";
import { useReleasesChanged } from "@/hooks/use-releases-changed";
import { matchesWords } from "@/lib/text";
import { WishlistTile, itemKey, useRequests, useTileContext } from "@/components/request-tiles";
import { toggled, type SortDir } from "@/lib/facets";
import { TYPES, ofTypes, sortWishlist, sortsFor, typeLabel, type WishlistSortKey } from "./logic";
import { ErrorAlert } from "@/components/error-alert";

// What's been requested: the user's own, or for admins everyone's with who
// asked. The search box filters it by title, the Type menu to movies or
// shows; the sort menu orders it
// (admins: most wanted first, everyone else: latest added; logic.ts); a poster grid, like Discover. A title opens its releases for admins, its TMDB page for
// everyone else.
export default function WishlistPage() {
  const [query, setQuery] = useState("");
  const r = useRequests();
  useReleasesChanged(() => void r.reload());
  const ctx = useTileContext(r);
  const q = query.trim();
  const matches = matchesWords(q);
  const [types, setTypes] = useState<Set<string>>(() => new Set());
  const toggleType = (t: string) => setTypes((prev) => toggled(prev, t));
  // Until picked, the default for whose list it is.
  const [sort, setSort] = useState<{ key: WishlistSortKey; dir: SortDir } | null>(null);
  const sorts = sortsFor(r.overview);
  const current =
    sort && sorts.some((s) => s.key === sort.key) ? sort : { key: sorts[0].key, dir: sorts[0].defaultDir };
  const shown = sortWishlist(
    r.requests.filter((item) => matches(item.title)).filter(ofTypes(types)),
    current.key,
    current.dir,
  );

  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      <h1 className="text-3xl font-semibold max-md:sr-only">Wishlist</h1>

      {r.error ? <ErrorAlert>{r.error}</ErrorAlert> : null}

      <PageTools active={!!query || types.size > 0}>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={r.overview ? "Search everyone's wishlists" : "Search your wishlist"}
            size="lg"
          />
          <FacetMenu
            facet={{
              key: "type",
              label: "Type",
              values: [...TYPES],
              selected: types,
              onToggle: toggleType,
              format: typeLabel,
            }}
          />
          <SortMenu
            className="ml-auto"
            options={sorts}
            sortKey={current.key}
            sortDir={current.dir}
            onChange={(key, dir) => setSort({ key, dir })}
          />
        </div>
        <FilterChips
          chips={[...types].map((t) => ({ id: t, label: typeLabel(t), onRemove: () => toggleType(t) }))}
          onClear={() => setTypes(new Set())}
        />
      </PageTools>

      <div className="mt-6">
        {r.loading ? (
          <PosterGridSkeleton />
        ) : shown.length === 0 ? (
          q || types.size ? (
            <EmptyState
              icon={SearchX}
              title="Nothing found"
              hint={
                q
                  ? r.overview
                    ? `Nothing on anyone's wishlist matches “${q}”.`
                    : `Nothing on your wishlist matches “${q}”.`
                  : "Nothing of that type. Try removing the filter."
              }
            />
          ) : (
            <EmptyState icon={Inbox} title="Your wishlist is empty" />
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
