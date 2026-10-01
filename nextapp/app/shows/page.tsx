"use client";

import { useState } from "react";
import { AlertCircle, Tv } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { FilterChips, FilterMenu } from "@/components/filter-menu";
import { POSTER_GRID, PosterCard, PosterGridSkeleton } from "@/components/poster-card";
import { SortMenu } from "@/components/sort-menu";
import { apiFetch, tmdbUrl } from "@/lib/api-client";
import type { ShowsResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { byCount, toggled, type SortDir } from "@/lib/facets";
import { plural } from "@/lib/format";
import { languageName } from "@/lib/languages";
import { SORTS, languageBadge, showMeta, showView, type SortKey } from "./logic";

const loadShows = () => apiFetch<ShowsResponse>("/api/shows").then((res) => res.Items);

export default function ShowsPage() {
  const library = useLoad(loadShows);
  const shows = library.data ?? [];
  const loading = library.loading;
  const error = library.error && `Failed to load library: ${library.error}`;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => new Set());
  const [genreFilter, setGenreFilter] = useState<Set<string>>(() => new Set());
  const [langFilter, setLangFilter] = useState<Set<string>>(() => new Set());
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { rows, statusCounts, genreCounts, langCounts, narrowed, totalEpisodes } = showView(
    shows,
    { query, statuses: statusFilter, genres: genreFilter, langs: langFilter },
    sortKey,
    sortDir
  );
  const chips = [
    ...[...statusFilter].map((s) => ({
      id: `status-${s}`,
      label: s,
      onRemove: () => setStatusFilter((prev) => toggled(prev, s)),
    })),
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
        <h1 className="text-2xl font-semibold tracking-tight">TV Shows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Loading…"
            : narrowed
              ? `${rows.length} of ${shows.length} shows`
              : `${shows.length} shows · ${plural(totalEpisodes, "episode")}`}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search shows…" className="w-full sm:w-64" />
        <FilterMenu
          facets={[
            {
              key: "status",
              label: "Status",
              values: byCount(statusCounts),
              counts: statusCounts,
              selected: statusFilter,
              onToggle: (v) => setStatusFilter((prev) => toggled(prev, v)),
            },
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
          setStatusFilter(new Set());
          setGenreFilter(new Set());
          setLangFilter(new Set());
        }}
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
                meta={showMeta(item, sortKey)}
                // Ended is the norm and gets no badge.
                badge={item.Status === "Continuing" ? { label: "Continuing" } : undefined}
                filterBadge={languageBadge(item.Languages, langFilter)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
