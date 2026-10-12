"use client";

import { useState } from "react";
import { FacetMenu, FilterChips } from "@/components/filter-menu";
import { PageTools } from "@/components/page-tools";
import { SearchInput } from "@/components/search-input";
import { SortMenu, type SortOption } from "@/components/sort-menu";
import { byCount, toggled, type LibraryFilters, type SortDir } from "@/lib/facets";
import { languageName } from "@/lib/languages";

// A library page's (Movies, Shows) search, genre and language filters
// and sort, as the page's state; the toolbar below shows and changes it.
export function useLibraryFilters<K extends string>(defaultSort: K) {
  const [query, setQuery] = useState("");
  const [genres, setGenres] = useState<Set<string>>(() => new Set());
  const [langs, setLangs] = useState<Set<string>>(() => new Set());
  const [sortKey, setSortKey] = useState<K>(defaultSort);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const filters: LibraryFilters = { query, genres, langs };
  return { filters, setQuery, setGenres, setLangs, sortKey, setSortKey, sortDir, setSortDir };
}

export function LibraryToolbar<K extends string>({
  state,
  sorts,
  genreCounts,
  langCounts,
  placeholder,
}: {
  state: ReturnType<typeof useLibraryFilters<K>>;
  sorts: readonly SortOption<K>[];
  genreCounts: Map<string, number>;
  langCounts: Map<string, number>;
  placeholder: string;
}) {
  const { filters, setQuery, setGenres, setLangs } = state;
  const chips = [
    ...[...filters.genres].map((g) => ({
      id: `genre-${g}`,
      label: g,
      onRemove: () => setGenres((prev) => toggled(prev, g)),
    })),
    ...[...filters.langs].map((l) => ({
      id: `lang-${l}`,
      label: languageName(l),
      onRemove: () => setLangs((prev) => toggled(prev, l)),
    })),
  ];
  return (
    <PageTools active={!!filters.query || chips.length > 0}>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <SearchInput value={filters.query} onChange={setQuery} placeholder={placeholder} size="lg" />
        <FacetMenu
          facet={{
            key: "genre",
            label: "Genre",
            values: byCount(genreCounts),
            counts: genreCounts,
            selected: filters.genres,
            onToggle: (v) => setGenres((prev) => toggled(prev, v)),
          }}
        />
        <FacetMenu
          facet={{
            key: "lang",
            label: "Audio",
            values: byCount(langCounts),
            counts: langCounts,
            selected: filters.langs,
            onToggle: (v) => setLangs((prev) => toggled(prev, v)),
            format: languageName,
          }}
        />
        <div className="ml-auto">
          <SortMenu
            options={sorts}
            sortKey={state.sortKey}
            sortDir={state.sortDir}
            onChange={(key, dir) => {
              state.setSortKey(key);
              state.setSortDir(dir);
            }}
          />
        </div>
      </div>

      <FilterChips
        chips={chips}
        onClear={() => {
          setGenres(new Set());
          setLangs(new Set());
        }}
      />
    </PageTools>
  );
}
