"use client";

import { Film, Tv } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import type { LibraryAnalytics } from "@/lib/api-types";
import { FileTable } from "./file-table";
import { ShareChart } from "./share-chart";
import type { Library } from "@/lib/libraries";
import { overviewTiles } from "./logic";

// One library's tab: the tiles, the share chart and the file list.
// version: the sync the
// numbers are from, so the list loads again after one.
export function LibraryView({
  library,
  stats,
  version,
}: {
  library: Library;
  stats: LibraryAnalytics;
  version: string | null;
}) {
  if (stats.titles === 0) {
    return (
      <div className="mt-6">
        {library === "movies" ? (
          <EmptyState
            icon={Film}
            title="No movies yet"
            hint="Once Jellyfin has synced, your library's numbers show up here."
          />
        ) : (
          <EmptyState
            icon={Tv}
            title="No shows yet"
            hint="Once Jellyfin has synced, your library's numbers show up here."
          />
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {overviewTiles(stats, library).map((t) => (
          <StatTile key={t.label} {...t} />
        ))}
      </div>
      <ShareChart stats={stats} />
      <FileTable library={library} version={version} />
    </>
  );
}
