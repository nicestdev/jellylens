"use client";

import { ChartPie } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { StatTile } from "@/components/stat-tile";
import { SyncNotice, useSyncNow } from "@/components/sync-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoad } from "@/hooks/use-load";
import { apiFetch } from "@/lib/api-client";
import type { AnalyticsResponse } from "@/lib/api-types";
import { AudioGoal, GroupRanking, QualityHeatmap } from "./charts";
import { groupRows, overviewTiles } from "./logic";

const loadAnalytics = () => apiFetch<AnalyticsResponse>("/api/analytics");

// Both libraries at once: the tiles, then how much has German and English
// audio, where the space goes by resolution and codec, and the release
// groups by size.
export default function AnalyticsPage() {
  const { data, error, loading, reload } = useLoad(loadAnalytics);
  // Files not stored yet come with the next library scan.
  const sync = useSyncNow("library", reload);
  const empty = data && data.movies.titles + data.shows.titles === 0;

  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      <h1 className="text-3xl font-semibold max-md:sr-only">Analytics</h1>

      {error || sync.error ? <ErrorAlert>{sync.error || `Failed to load analytics: ${error}`}</ErrorAlert> : null}

      {data?.movies.pending || data?.shows.pending ? (
        <SyncNotice onSync={sync.sync} syncing={sync.syncing}>
          The library&apos;s files come with the next library scan.
        </SyncNotice>
      ) : null}

      {loading && !data ? (
        <div className="mt-4 grid gap-4 sm:mt-6 sm:grid-cols-3 sm:gap-6 phone-landscape:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[4.625rem] rounded-lg" />
          ))}
        </div>
      ) : empty ? (
        <div className="mt-4 sm:mt-6">
          <EmptyState
            icon={ChartPie}
            title="Nothing synced yet"
            hint="Once the library is scanned, its numbers show up here."
          />
        </div>
      ) : data ? (
        <>
          <div className="mt-4 grid gap-4 sm:mt-6 sm:grid-cols-3 sm:gap-6 phone-landscape:grid-cols-3">
            {overviewTiles(data).map((t) => (
              <StatTile key={t.label} {...t} />
            ))}
          </div>
          <div className="mt-4 grid items-start gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-2 phone-landscape:grid-cols-2">
            <div className="grid gap-4 sm:gap-6">
              <AudioGoal data={data} />
              <QualityHeatmap data={data} />
            </div>
            <GroupRanking rows={groupRows(data)} groups={data.groups.filter((g) => g.value !== null).length} />
          </div>
        </>
      ) : null}
    </main>
  );
}
