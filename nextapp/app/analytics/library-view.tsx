"use client";

import { useRef, useState } from "react";
import { Film, Tv } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import type { LibraryAnalytics } from "@/lib/api-types";
import { FileTable } from "./file-table";
import { ShareChart } from "./share-chart";
import { fileFacets, noListFilters, overviewTiles, type Dimension, type Library, type ListFilters, type Segment } from "./logic";

// One library's tab: the tiles, the share chart and the file list, with
// the list's filters of its own. A click on a piece of the chart sets its
// dimension's filter and scrolls to the list. version: the sync the
// numbers are from, so the list loads again after one.
export function LibraryView({ library, stats, version }: { library: Library; stats: LibraryAnalytics; version: string | null }) {
  const [filters, setFilters] = useState<ListFilters>(noListFilters);
  const setFilter = (dimension: Dimension, values: Set<string>) => setFilters((prev) => ({ ...prev, [dimension]: values }));
  const files = useRef<HTMLElement>(null);
  const showFiles = (s: Segment) => {
    setFilter(s.dimension, new Set(s.values));
    files.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (stats.titles === 0) {
    return (
      <div className="mt-6">
        {library === "movies" ? (
          <EmptyState icon={Film} title="No movies yet" hint="Once Jellyfin has synced, your library's numbers show up here." />
        ) : (
          <EmptyState icon={Tv} title="No shows yet" hint="Once Jellyfin has synced, your library's numbers show up here." />
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {overviewTiles(stats, library).map((t) => (
          <StatTile key={t.label} {...t} />
        ))}
      </div>
      <ShareChart stats={stats} filters={filters} onSelect={showFiles} />
      <FileTable
        ref={files}
        library={library}
        facets={fileFacets(stats)}
        filters={filters}
        onFilter={setFilter}
        version={version}
      />
    </>
  );
}
