"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AlertCircle, Film, Info, RefreshCw, Star, Tv } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ReleasePanel } from "@/components/release-panel";
import { apiFetch, runSync } from "@/lib/api-client";
import type { UpgradesResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { SwitchView } from "./switch-view";
import type { Library, PanelFor } from "./logic";

// One library's tab. Picking a group, quality or codec adds up again
// without a request. A file's name opens its title's release panel.
export function UpgradesView({ library }: { library: Library }) {
  const load = useCallback(() => apiFetch<UpgradesResponse>(`/api/upgrades?library=${library}`), [library]);
  const { data, error, loading, reload } = useLoad(load);
  const [panel, setPanel] = useState<PanelFor | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");

  // Releases stored before sizes were get theirs with a releases sync.
  async function syncNow() {
    setSyncing(true);
    setSyncError("");
    try {
      await runSync("releases");
    } catch (e) {
      setSyncError(`Sync failed: ${(e as Error).message}`);
    } finally {
      await reload();
      setSyncing(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertCircle />
        <AlertDescription>Failed to load: {error}</AlertDescription>
      </Alert>
    );
  }

  if (!data.units.length) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={library === "movies" ? Film : Tv}
          title={library === "movies" ? "No movies yet" : "No shows yet"}
          hint="Once Jellyfin has synced, your files show up here."
        />
      </div>
    );
  }

  if (!data.favorites.length) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={Star}
          title="No favorite groups"
          hint="Add the release groups you like in Settings; their releases are what your files are compared with."
        />
        <div className="mt-3 text-center">
          <Link href="/settings" className="text-sm text-primary hover:underline">
            Go to Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {error || syncError ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{syncError || `Failed to load: ${error}`}</AlertDescription>
        </Alert>
      ) : null}
      {data.sizesPending ? (
        <Alert className="mt-6">
          <Info />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Some groups haven&apos;t loaded all their releases yet; the next releases sync fetches the rest.</span>
            <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
              <RefreshCw className={syncing ? "animate-spin" : undefined} />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <SwitchView library={library} data={data} onOpen={setPanel} />

      <ReleasePanel
        title={panel?.title ?? null}
        only={panel?.only}
        onClose={() => setPanel(null)}
        onChanged={() => void reload()}
      />
    </>
  );
}
