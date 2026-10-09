"use client";

import { AlertCircle, Tv } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { LibraryToolbar, useLibraryFilters } from "@/components/library-toolbar";
import { POSTER_GRID, PosterCard, PosterGridSkeleton } from "@/components/poster-card";
import { apiFetch, tmdbUrl } from "@/lib/api-client";
import type { ShowsResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { formatNumber, plural } from "@/lib/format";
import { SORTS, showMeta, showView, type SortKey } from "./logic";

const loadShows = () => apiFetch<ShowsResponse>("/api/shows").then((res) => res.Items);

export default function ShowsPage() {
  const library = useLoad(loadShows);
  const shows = library.data ?? [];
  const loading = library.loading;
  const error = library.error && `Failed to load library: ${library.error}`;
  const lib = useLibraryFilters<SortKey>("title");

  const { rows, genreCounts, langCounts, narrowed, totalEpisodes } = showView(
    shows,
    lib.filters,
    lib.sortKey,
    lib.sortDir,
  );

  return (
    <main className="w-full max-w-[1440px] px-4 py-5 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold">TV Shows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Loading…"
            : narrowed
              ? `${formatNumber(rows.length)} of ${plural(shows.length, "show")}`
              : `${plural(shows.length, "show")} · ${plural(totalEpisodes, "episode")}`}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <LibraryToolbar
        state={lib}
        sorts={SORTS}
        genreCounts={genreCounts}
        langCounts={langCounts}
        placeholder="Search shows…"
      />

      <div className="mt-6">
        {loading ? (
          <PosterGridSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState icon={Tv} title="No shows found" hint="Try a different search or remove a filter." />
        ) : (
          <div className={POSTER_GRID}>
            {rows.map((item) => (
              <PosterCard
                key={item.Id}
                href={tmdbUrl("tv", item.ProviderIds?.Tmdb)}
                itemId={item.Id}
                imageTag={item.ImageTags?.Primary}
                title={item.Name}
                meta={showMeta(item, lib.sortKey)}
                // Only a running show is worth a badge; ended is the usual case.
                badge={item.Status === "Continuing" ? { label: "Continuing" } : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
