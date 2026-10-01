"use client";

import { useState } from "react";
import { AlertCircle, Info, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, runSync } from "@/lib/api-client";
import type { AnalyticsResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { LibraryView } from "./library-view";
import { subtitle, type Library } from "./logic";

const loadAnalytics = () => apiFetch<AnalyticsResponse>("/api/analytics");

const TABS: { library: Library; label: string }[] = [
  { library: "movies", label: "Movies" },
  { library: "shows", label: "TV Shows" },
];

// One tab per library. Both stay mounted, so switching keeps each one's
// filters and page.
export default function AnalyticsPage() {
  const { data, error, loading, reload } = useLoad(loadAnalytics);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");

  // Files stored before the file list was only come with a Jellyfin sync.
  async function syncNow() {
    setSyncing(true);
    setSyncError("");
    try {
      await runSync("jellyfin");
    } catch (e) {
      setSyncError(`Sync failed: ${(e as Error).message}`);
    } finally {
      await reload();
      setSyncing(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Tabs defaultValue="movies" className="gap-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle(data)}</p>
          </div>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.library} value={t.library} className="px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {error || syncError ? (
          <Alert variant="destructive" className="mt-6">
            <AlertCircle />
            <AlertDescription>{syncError || `Failed to load analytics: ${error}`}</AlertDescription>
          </Alert>
        ) : null}

        {data?.movies.pending || data?.shows.pending ? (
          <Alert className="mt-6">
            <Info />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>The library&apos;s files come with the next Jellyfin sync.</span>
              <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
                <RefreshCw className={syncing ? "animate-spin" : undefined} />
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {TABS.map((t) => (
          <TabsContent key={t.library} value={t.library} keepMounted>
            {loading && !data ? (
              <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : data ? (
              <LibraryView library={t.library} stats={data[t.library]} version={data.syncedAt} />
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
