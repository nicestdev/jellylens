"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/segmented";
import { SyncNotice, useSyncNow } from "@/components/sync-notice";
import { apiFetch } from "@/lib/api-client";
import type { AnalyticsResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { LibraryView } from "./library-view";
import { LIBRARIES, type Library } from "@/lib/libraries";
import { subtitle } from "./logic";

const loadAnalytics = () => apiFetch<AnalyticsResponse>("/api/analytics");

// One view per library behind a switch: the tiles, the share charts and
// the file list. Both stay mounted (the other one hidden), so switching
// keeps each one's filters and page.
export default function AnalyticsPage() {
  const { data, error, loading, reload } = useLoad(loadAnalytics);
  const [library, setLibrary] = useState<Library>("movies");
  // Files stored before the file list was only come with a Jellyfin sync.
  const sync = useSyncNow("jellyfin", reload);

  return (
    <main className="w-full max-w-[1440px] px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle(data)}</p>
        </div>
        <Segmented
          label="Library"
          segments={LIBRARIES}
          value={library}
          onChange={setLibrary}
          className="w-full sm:w-auto"
        />
      </div>

      {error || sync.error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{sync.error || `Failed to load analytics: ${error}`}</AlertDescription>
        </Alert>
      ) : null}

      {data?.movies.pending || data?.shows.pending ? (
        <SyncNotice onSync={sync.sync} syncing={sync.syncing}>
          The library&apos;s files come with the next Jellyfin sync.
        </SyncNotice>
      ) : null}

      {LIBRARIES.map((l) => (
        <div key={l.key} hidden={l.key !== library}>
          {loading && !data ? (
            <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[74px] rounded-lg" />
              ))}
            </div>
          ) : data ? (
            <LibraryView library={l.key} stats={data[l.key]} version={data.syncedAt} />
          ) : null}
        </div>
      ))}
    </main>
  );
}
