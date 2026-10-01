"use client";

import { useState } from "react";
import { AlertCircle, Film } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { FilterChips, FilterMenu } from "@/components/filter-menu";
import { POSTER_GRID, PosterCard, PosterGridSkeleton } from "@/components/poster-card";
import { SortMenu } from "@/components/sort-menu";
import { apiFetch, tmdbUrl } from "@/lib/api-client";
import type { MovieItem as Movie, MoviesResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { byCount, toggled, type SortDir } from "@/lib/facets";
import { languageName } from "@/lib/languages";
import { SORTS, movieMeta, movieView, resolutionLabel, type SortKey } from "./logic";

function MovieCard({ item, href }: { item: Movie; href?: string }) {
  const res = resolutionLabel(item.Width, item.Height);
  return (
    <PosterCard
      href={href}
      itemId={item.Id}
      imageTag={item.ImageTags?.Primary}
      title={item.Name}
      meta={movieMeta(item)}
      badge={res ? { label: res, tone: res === "4K" ? "accent" : "neutral" } : undefined}
    />
  );
}

const loadMovies = () => apiFetch<MoviesResponse>("/api/movies").then((res) => res.Items);

export default function MoviesPage() {
  const library = useLoad(loadMovies);
  const movies = library.data ?? [];
  const loading = library.loading;
  const error = library.error && `Failed to load library: ${library.error}`;
  const [query, setQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState<Set<string>>(() => new Set());
  const [langFilter, setLangFilter] = useState<Set<string>>(() => new Set());
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { rows, genreCounts, langCounts, narrowed } = movieView(
    movies,
    { query, genres: genreFilter, langs: langFilter },
    sortKey,
    sortDir
  );
  const chips = [
    ...[...genreFilter].map((g) => ({
      id: `genre-${g}`,
      label: g,
      onRemove: () => setGenreFilter((prev) => toggled(prev, g)),
    })),
    ...[...langFilter].map((l) => ({
      id: `lang-${l}`,
      label: languageName(l),
      onRemove: () => setLangFilter((prev) => toggled(prev, l)),
    })),
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Movies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Loading…"
            : narrowed
              ? `${rows.length} of ${movies.length} movies`
              : `${movies.length} movies`}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search movies…" className="w-full sm:w-64" />
        <FilterMenu
          facets={[
            {
              key: "genre",
              label: "Genre",
              values: byCount(genreCounts),
              counts: genreCounts,
              selected: genreFilter,
              onToggle: (v) => setGenreFilter((prev) => toggled(prev, v)),
            },
            {
              key: "lang",
              label: "Language",
              values: byCount(langCounts),
              counts: langCounts,
              selected: langFilter,
              onToggle: (v) => setLangFilter((prev) => toggled(prev, v)),
              format: languageName,
            },
          ]}
        />
        <div className="ml-auto">
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

      <FilterChips
        chips={chips}
        onClear={() => {
          setGenreFilter(new Set());
          setLangFilter(new Set());
        }}
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
