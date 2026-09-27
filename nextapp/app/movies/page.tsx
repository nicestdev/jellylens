"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Film } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { FilterChips, FilterMenu, byCount, countValues, toggled } from "@/components/filter-menu";
import { POSTER_GRID, PosterCard, PosterGridSkeleton } from "@/components/poster-card";
import { SortMenu, compareValues, type SortDir } from "@/components/sort-menu";
import { apiFetch, type MediaItem } from "@/lib/api-client";
import { languageName } from "@/lib/languages";

// The lean shape /api/movies sends. Codec and release group are left out on
// purpose: in this library nearly everything is x265 from two groups, so they
// only added noise.
type Movie = MediaItem & {
  ImageTags?: { Primary?: string };
  Width?: number;
  Height?: number;
  RunTimeTicks?: number;
  Genres?: string[];
  AudioLanguages?: string[];
};

function resolutionLabel(width?: number, height?: number): string {
  const w = width || 0, h = height || 0;
  if (!w && !h) return "";
  if (w >= 3800 || h >= 2100) return "4K";
  if (w >= 1900 || h >= 1060) return "1080p";
  if (w >= 1260 || h >= 700) return "720p";
  return "SD";
}

function movieFacets(item: Movie) {
  return {
    res: resolutionLabel(item.Width, item.Height),
    langs: item.AudioLanguages ?? [],
  };
}

// Title sorts A→Z first; the numeric keys start with the longest/newest,
// which is almost always what you want when you pick them. File size is left
// out on purpose — it doesn't matter for browsing.
const SORTS = [
  { key: "title", label: "Title", defaultDir: "asc" },
  { key: "year", label: "Year", defaultDir: "desc" },
  { key: "duration", label: "Runtime", defaultDir: "desc" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

function movieSortValue(item: Movie, key: SortKey): string | number {
  switch (key) {
    case "title": return item.Name.toLowerCase();
    case "year": return item.ProductionYear ?? 0;
    case "duration": return item.RunTimeTicks ?? 0;
  }
}

function MovieCard({ item, href }: { item: Movie; href: string }) {
  const f = movieFacets(item);
  const minutes = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600000000) : null;
  const meta = [item.ProductionYear, minutes ? `${minutes} min` : null].filter(Boolean).join(" · ");
  return (
    <PosterCard
      href={href}
      itemId={item.Id}
      imageTag={item.ImageTags?.Primary}
      title={item.Name}
      meta={meta}
      badge={f.res ? { label: f.res, tone: f.res === "4K" ? "accent" : "neutral" } : undefined}
    />
  );
}

export default function MoviesPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [jellyfinUrl, setJellyfinUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState<Set<string>>(() => new Set());
  const [langFilter, setLangFilter] = useState<Set<string>>(() => new Set());
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const load = useCallback(async () => {
    try {
      const [config, moviesRes] = await Promise.all([
        apiFetch<{ jellyfinPublicUrl: string }>("/api/config"),
        apiFetch<{ Items: Movie[] }>("/api/movies"),
      ]);
      setJellyfinUrl(config.jellyfinPublicUrl);
      setMovies(moviesRes.Items ?? []);
      setError("");
    } catch (e) {
      setError(`Failed to load library: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function itemUrl(item: MediaItem): string {
    const tmdbId = item.ProviderIds?.Tmdb;
    if (tmdbId) return `https://www.themoviedb.org/movie/${tmdbId}`;
    return `${jellyfinUrl}/web/index.html#!/details?id=${item.Id}&serverId=${item.ServerId ?? ""}`;
  }

  // Menu counts come from the whole library, so the menus don't shrink as
  // you filter. A movie matches a facet if it has any selected value.
  const genreCounts = countValues(movies, (m) => m.Genres ?? []);
  const langCounts = countValues(movies, (m) => movieFacets(m).langs);
  const q = query.trim().toLowerCase();

  const filtered = movies.filter((item) => {
    if (q && !item.Name.toLowerCase().includes(q)) return false;
    if (genreFilter.size && !(item.Genres ?? []).some((g) => genreFilter.has(g))) return false;
    if (langFilter.size && !movieFacets(item).langs.some((l) => langFilter.has(l))) return false;
    return true;
  });

  const rows = [...filtered].sort((a, b) => {
    const cmp = compareValues(movieSortValue(a, sortKey), movieSortValue(b, sortKey));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const narrowed = Boolean(q) || genreFilter.size > 0 || langFilter.size > 0;
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
              <MovieCard key={item.Id} item={item} href={itemUrl(item)} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
