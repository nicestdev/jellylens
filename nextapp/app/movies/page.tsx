"use client";

import { AlertCircle, Film } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { LibraryToolbar, useLibraryFilters } from "@/components/library-toolbar";
import { POSTER_GRID, PosterCard, PosterGridSkeleton } from "@/components/poster-card";
import { apiFetch, tmdbImage, tmdbUrl } from "@/lib/api-client";
import type { MovieItem as Movie, MoviesResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { formatNumber, plural, resolutionLabel } from "@/lib/format";
import { SORTS, movieMeta, movieView, type SortKey } from "./logic";

function MovieCard({ item, href }: { item: Movie; href?: string }) {
  const res = resolutionLabel(item.Width, item.Height);
  return (
    <PosterCard
      href={href}
      imageSrc={tmdbImage(item.PosterPath)}
      title={item.Name}
      meta={movieMeta(item)}
      // 1080p is the norm, so only the exceptions (4K, 720p, SD) get a badge.
      badge={res && res !== "1080p" ? { label: res } : undefined}
    />
  );
}

const loadMovies = () => apiFetch<MoviesResponse>("/api/movies").then((res) => res.Items);

export default function MoviesPage() {
  const library = useLoad(loadMovies);
  const movies = library.data ?? [];
  const loading = library.loading;
  const error = library.error && `Failed to load library: ${library.error}`;
  const lib = useLibraryFilters<SortKey>("title");

  const { rows, genreCounts, langCounts, narrowed } = movieView(movies, lib.filters, lib.sortKey, lib.sortDir);

  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold">Movies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Loading…"
            : narrowed
              ? `${formatNumber(rows.length)} of ${plural(movies.length, "movie")}`
              : plural(movies.length, "movie")}
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
        placeholder="Search movies…"
      />

      <div className="mt-6">
        {loading ? (
          <PosterGridSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState icon={Film} title="No movies found" hint="Try a different search or remove a filter." />
        ) : (
          <div className={POSTER_GRID}>
            {rows.map((item) => (
              <MovieCard key={item.Id} item={item} href={tmdbUrl("movie", item.ProviderIds?.Tmdb)} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
