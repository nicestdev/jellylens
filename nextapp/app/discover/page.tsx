"use client";

import { useEffect, useState } from "react";
import { Compass, Loader2, SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FacetMenu, FilterChips, type Facet } from "@/components/filter-menu";
import { LoadMore } from "@/components/load-more";
import { POSTER_GRID, PosterCard, PosterGridSkeleton } from "@/components/poster-card";
import { SearchInput } from "@/components/search-input";
import { SortMenu } from "@/components/sort-menu";
import { RequestAction, ResultTile, itemKey, useDiscover, useRequests } from "@/components/request-tiles";
import { useReleasesChanged } from "@/hooks/use-releases-changed";
import { apiFetch, tmdbImage, tmdbPoster, tmdbUrl } from "@/lib/api-client";
import type { ReleasesResponse, ReleaseTitle as Title } from "@/lib/api-types";
import { toggled, type SortDir } from "@/lib/facets";
import { titleMeta } from "@/lib/release-labels";
import { titlePath } from "@/lib/title-path";
import { FACETS, SORTS, facetValues, noFilters, releasesUrl, type FacetKey, type SortKey } from "./releases";
import { ErrorAlert } from "@/components/error-alert";

type Filters = ReturnType<typeof noFilters>;

// The favorite groups' releases (app/api/releases), one tile per title,
// paged as the grid scrolls. Searching runs on the server (tens of
// thousands of releases), a moment after typing stops; while a sync runs
// the grid refreshes every few seconds so new titles trickle in.
function useReleases(query: string, filters: Filters, sortKey: SortKey, sortDir: SortDir) {
  const [data, setData] = useState<ReleasesResponse | null>(null);
  const [items, setItems] = useState<Title[]>([]);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped after a decision on a title page, to load the list again.
  const [reloads, setReloads] = useState(0);
  useReleasesChanged(() => setReloads((n) => n + 1));
  const params = (offset: number) => releasesUrl(query, filters, sortKey, sortDir, offset);
  const url = params(0);
  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const load = async (polled = false) => {
      try {
        const res = await apiFetch<ReleasesResponse>(url);
        if (cancelled) return;
        setData(res);
        // A poll while a sync runs keeps the pages scrolled in.
        setItems((shown) => (polled && shown.length > res.items.length ? shown : res.items));
        setError("");
        if (res.syncing) poll = setTimeout(() => load(true), 5000);
      } catch (e) {
        if (!cancelled) setError(`Failed to load releases: ${(e as Error).message}`);
      }
    };
    const debounce = setTimeout(() => load(), 200);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearTimeout(poll);
    };
  }, [url, reloads]);
  // The next page, kept only if the list is still the one it continues (a
  // new search or filter in the meantime replaces it).
  async function more() {
    if (loadingMore) return;
    const from = items;
    setLoadingMore(true);
    try {
      const res = await apiFetch<ReleasesResponse>(params(from.length));
      setItems((prev) => (prev === from ? [...prev, ...res.items] : prev));
    } catch (e) {
      setError(`Failed to load releases: ${(e as Error).message}`);
    } finally {
      setLoadingMore(false);
    }
  }
  return { data, items, error, more, loadingMore };
}

// An owned title's poster (the one the Movies page shows), else the match's.
const posterOf = (t: Title) =>
  t.library?.posterPath ? tmdbImage(t.library.posterPath) : tmdbPoster(t.posterPath, t.mediaType, t.tmdbId);

// The favorite groups' releases, newest first; a search finds them and,
// after them in the same grid, what else TMDB has (unless a group is picked:
// then only the groups are searched; with no groups, what's trending for
// everyone but admins). "+ Wishlist" puts a title on it; a title opens its
// releases for admins, its TMDB page for everyone else.
export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const [filters, setFilters] = useState(noFilters);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const r = useRequests();
  useReleasesChanged(() => void r.reload());
  const admin = r.admin;
  const releases = useReleases(q, filters, sortKey, sortDir);

  const toggle = (key: FacetKey, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: toggled(prev[key], value) }));
  const chips = FACETS.flatMap(({ key, format }) =>
    [...filters[key]].map((v) => ({ id: `${key}-${v}`, label: format(v), onRemove: () => toggle(key, v) })),
  );
  const filtered = chips.length > 0;

  const data = releases.data;
  const noGroups = data?.groups === 0;
  // TMDB: for a search over all groups, and with no groups to show, what's
  // trending (for everyone but admins, who get told to add some).
  const showTmdb = r.adminKnown && ((Boolean(q) && !filtered) || (!admin && noGroups));
  const discover = useDiscover(q, showTmdb);
  const error = r.error || releases.error || discover.error;

  const facets: Facet[] = FACETS.map(({ key, label, format }) => ({
    key,
    label,
    values: facetValues(key, releases.data?.facets[key] ?? [], filters[key]),
    selected: filters[key],
    onToggle: (v: string) => toggle(key, v),
    format,
    divideAfter: key === "group" ? releases.data?.favoriteGroups : undefined,
  }));

  // TMDB's results without the titles the releases show already.
  const shownKeys = new Set(releases.items.map((t) => t.key));
  const tmdbItems = discover.items.filter((item) => !shownKeys.has(itemKey(item)));

  // In library, or "+ Wishlist" — for titles matched to TMDB.
  const requestAction = (t: Title) => {
    if (!t.mediaType || !t.tmdbId) return undefined;
    const item = { ...t, mediaType: t.mediaType, tmdbId: t.tmdbId, availability: null };
    return <RequestAction item={item} requested={r.requestedKeys.has(itemKey(item))} ctx={r} />;
  };

  const tmdbTiles = tmdbItems.map((item) => (
    <ResultTile key={itemKey(item)} item={item} requested={r.requestedKeys.has(itemKey(item))} ctx={r} />
  ));

  return (
    <main className="w-full max-w-[90rem] px-4 py-4 sm:px-6 sm:py-5">
      <h1 className="text-3xl font-semibold max-md:sr-only">Discover</h1>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      <div className="flex flex-wrap items-center gap-2 md:mt-6">
        <SearchInput value={query} onChange={setQuery} placeholder="Search releases and TMDB" size="lg" grow />
        {facets.map((f) => (
          <FacetMenu key={f.key} facet={f} className="phone-portrait:hidden" />
        ))}
        <div className="ml-auto flex items-center gap-3 phone-portrait:hidden">
          {/* While a group's list comes in, the grid refreshes itself. */}
          {data?.syncing ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Syncing
            </span>
          ) : null}
          <SortMenu
            options={SORTS}
            sortKey={sortKey}
            sortDir={sortDir}
            onChange={(key, dir) => {
              setSortKey(key);
              setSortDir(dir);
            }}
          />
        </div>
      </div>
      <FilterChips chips={chips} onClear={() => setFilters(noFilters())} />

      <div className="mt-4 md:mt-6">
        {!r.adminKnown ? (
          <PosterGridSkeleton />
        ) : !data ? (
          <PosterGridSkeleton />
        ) : (
          <>
            {releases.items.length || (showTmdb && tmdbItems.length) ? (
              <>
                <div className={POSTER_GRID}>
                  {releases.items.map((t) => (
                    <PosterCard
                      key={t.key}
                      href={
                        admin ? titlePath(t.key) : t.mediaType && t.tmdbId ? tmdbUrl(t.mediaType, t.tmdbId) : undefined
                      }
                      imageSrc={posterOf(t)}
                      title={t.title}
                      meta={titleMeta(t)}
                      action={requestAction(t)}
                    />
                  ))}
                  {/* TMDB's after the releases, once every release is in. */}
                  {showTmdb && releases.items.length >= data.matched ? tmdbTiles : null}
                </div>
                {releases.items.length < data.matched ? (
                  <LoadMore shown={releases.items.length} onMore={releases.more} loading={releases.loadingMore} />
                ) : null}
              </>
            ) : noGroups && !q ? (
              <EmptyState
                icon={Compass}
                title="No release groups yet"
                hint="Add your favorite groups under Settings → Release groups, or search TMDB for a movie or show."
              />
            ) : data.syncing && data.total === 0 ? (
              <EmptyState
                icon={Loader2}
                title="Loading releases"
                hint="A group's first sync fetches its whole list from xREL, which takes a moment."
              />
            ) : !showTmdb || (!discover.loading && !tmdbItems.length) ? (
              <EmptyState icon={SearchX} title="Nothing found" hint="Try a different search or remove a filter." />
            ) : discover.loading ? (
              <PosterGridSkeleton />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
