"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { LibraryToolbar, useLibraryFilters } from "@/components/library-toolbar";
import { POSTER_GRID, PosterGridSkeleton } from "@/components/poster-card";
import type { SortOption } from "@/components/sort-menu";
import { useLoad } from "@/hooks/use-load";
import type { LibraryFilters, SortDir } from "@/lib/facets";
import { formatNumber } from "@/lib/format";

// Movies and Shows: the library's poster grid under its search, filters
// and sort; the page gives what's its own (what to load, how it's
// filtered and sorted, a tile).
export function LibraryPage<T extends { id: string }, K extends string>({
  title,
  icon,
  load,
  view,
  sorts,
  defaultSort,
  tile,
}: {
  title: "Movies" | "Shows";
  icon: LucideIcon;
  load: () => Promise<T[]>;
  view: (
    items: T[],
    filters: LibraryFilters,
    sortKey: K,
    sortDir: SortDir,
  ) => { rows: T[]; genreCounts: Map<string, number>; langCounts: Map<string, number> };
  sorts: readonly SortOption<K>[];
  defaultSort: K;
  tile: (item: T, sortKey: K) => ReactNode;
}) {
  const library = useLoad(load);
  const items = library.data ?? [];
  const loading = library.loading;
  const error = library.error && `Failed to load library: ${library.error}`;
  const lib = useLibraryFilters<K>(defaultSort);
  const noun = title.toLowerCase();

  const { rows, genreCounts, langCounts } = view(items, lib.filters, lib.sortKey, lib.sortDir);

  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      <h1 className="text-3xl font-semibold max-md:sr-only">{title}</h1>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      <LibraryToolbar
        state={lib}
        sorts={sorts}
        genreCounts={genreCounts}
        langCounts={langCounts}
        placeholder={loading ? `Search ${noun}` : `Search ${formatNumber(items.length)} ${noun}`}
      />

      <div className="mt-6">
        {loading ? (
          <PosterGridSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={icon}
            title={`No ${noun} found`}
            hint={items.length ? "Try a different search or remove a filter." : undefined}
          />
        ) : (
          <div className={POSTER_GRID}>{rows.map((item) => tile(item, lib.sortKey))}</div>
        )}
      </div>
    </main>
  );
}
