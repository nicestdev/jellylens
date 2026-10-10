"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, PackageSearch, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadMore } from "@/components/load-more";
import { EmptyState } from "@/components/empty-state";
import { POSTER_GRID, PosterCard, PosterGridSkeleton } from "@/components/poster-card";
import { SearchInput } from "@/components/search-input";
import { FacetMenu, FilterChips, type Facet } from "@/components/filter-menu";
import { SortMenu } from "@/components/sort-menu";
import { RequestAction, itemKey, useRequests } from "@/components/request-tiles";
import { apiFetch, tmdbImage, tmdbPoster } from "@/lib/api-client";
import type { ReleasesResponse, ReleaseTitle as Title } from "@/lib/api-types";
import { toggled, type SortDir } from "@/lib/facets";
import { FACETS, SORTS, facetValues, noFilters, releasesUrl, subtitle, type FacetKey, type SortKey } from "./logic";
import { useRouter } from "next/navigation";
import { useReleasesChanged } from "@/hooks/use-releases-changed";
import { titlePath } from "@/lib/title-path";
import { titleMeta } from "@/lib/release-labels";

// An owned title's poster (the one the Movies page shows), else the match's.
const poster = (t: Title) => ({
  imageSrc: t.library?.posterPath ? tmdbImage(t.library.posterPath) : tmdbPoster(t.posterPath, t.mediaType, t.tmdbId),
});

export default function ReleasesPage() {
  const [data, setData] = useState<ReleasesResponse | null>(null);
  const [items, setItems] = useState<Title[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(noFilters);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loadingMore, setLoadingMore] = useState(false);
  const router = useRouter();
  // Bumped after a decision on a title page, to load the list again.
  const [reloads, setReloads] = useState(0);
  useReleasesChanged(() => setReloads((n) => n + 1));
  const requests = useRequests();

  // In library, or + to request it — for titles matched to TMDB.
  const requestAction = (t: Title) => {
    if (!t.mediaType || !t.tmdbId) return undefined;
    const item = { ...t, mediaType: t.mediaType, tmdbId: t.tmdbId, availability: null };
    return <RequestAction item={item} requested={requests.requestedKeys.has(itemKey(item))} ctx={requests} />;
  };

  const params = (offset: number) => releasesUrl(query, filters, sortKey, sortDir, offset);
  const url = params(0);

  // Searching runs on the server (tens of thousands of releases), a moment
  // after typing stops. While a sync runs, the grid refreshes every few
  // seconds so new titles and posters trickle in.
  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const res = await apiFetch<ReleasesResponse>(url);
        if (cancelled) return;
        setData(res);
        setItems(res.Items);
        setError("");
        if (res.syncing) poll = setTimeout(load, 5000);
      } catch (e) {
        if (!cancelled) setError(`Failed to load releases: ${(e as Error).message}`);
      }
    };
    const debounce = setTimeout(load, 200);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearTimeout(poll);
    };
  }, [url, reloads]);

  // The next page, kept only if the list is still the one it continues (a
  // new search or filter in the meantime replaces it).
  async function showMore() {
    if (loadingMore) return;
    const from = items;
    setLoadingMore(true);
    try {
      const res = await apiFetch<ReleasesResponse>(params(from.length));
      setItems((prev) => (prev === from ? [...prev, ...res.Items] : prev));
    } catch (e) {
      setError(`Failed to load releases: ${(e as Error).message}`);
    } finally {
      setLoadingMore(false);
    }
  }

  const toggle = (key: FacetKey, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: toggled(prev[key], value) }));

  const facets: Facet[] = FACETS.map(({ key, label, format }) => ({
    key,
    label,
    values: facetValues(key, data?.facets[key] ?? [], filters[key]),
    selected: filters[key],
    onToggle: (v: string) => toggle(key, v),
    format,
  }));
  const chips = FACETS.flatMap(({ key, format }) =>
    [...filters[key]].map((v) => ({ id: `${key}-${v}`, label: format(v), onRemove: () => toggle(key, v) })),
  );

  const narrowed = Boolean(query.trim()) || chips.length > 0;

  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold">Releases</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          {subtitle(data, narrowed)}
          {data?.syncing ? (
            <span className="flex items-center gap-1">
              · <Loader2 className="size-3.5 animate-spin" /> syncing
            </span>
          ) : null}
        </p>
      </div>

      {error || requests.error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error || requests.error}</AlertDescription>
        </Alert>
      ) : null}

      {data?.groups === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title="No release groups yet"
            hint="Add your favorite P2P groups under Settings → Release groups, and their releases show up here."
          />
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search releases…" className="w-full sm:w-64" />
            {facets.map((f) => (
              <FacetMenu key={f.key} facet={f} />
            ))}
            <div className="ml-auto flex items-center gap-2">
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

          <div className="mt-6">
            {!data ? (
              <PosterGridSkeleton />
            ) : items.length === 0 ? (
              data.syncing && data.total === 0 ? (
                <EmptyState
                  icon={Loader2}
                  title="Loading releases…"
                  hint="A group's first sync fetches its whole list from xREL, which takes a moment."
                />
              ) : (
                <EmptyState
                  icon={PackageSearch}
                  title="No releases found"
                  hint="Try a different search or remove a filter."
                />
              )
            ) : (
              <>
                <div className={POSTER_GRID}>
                  {items.map((t) => (
                    <PosterCard
                      key={t.key}
                      onClick={() => router.push(titlePath(t.key))}
                      {...poster(t)}
                      title={t.title}
                      meta={titleMeta(t)}
                      action={requestAction(t)}
                    />
                  ))}
                </div>
                {items.length < data.matched ? (
                  <LoadMore shown={items.length} onMore={showMore} loading={loadingMore} />
                ) : null}
              </>
            )}
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Release info from{" "}
            <a
              href="https://www.xrel.to"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-primary"
            >
              xREL
            </a>
            , posters from TMDB.
          </p>
        </>
      )}
    </main>
  );
}
