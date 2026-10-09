"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Film, Star, Tv } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { SyncNotice, useSyncNow } from "@/components/sync-notice";
import { apiFetch } from "@/lib/api-client";
import type { UpgradesResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { useReleasesChanged } from "@/hooks/use-releases-changed";
import { SwitchView } from "./switch-view";
import type { Library } from "@/lib/libraries";

// One library's tab. Picking a group, quality or codec adds up again
// without a request. A title opens its page on the target's releases.
export function UpgradesView({ library }: { library: Library }) {
  const load = useCallback(() => apiFetch<UpgradesResponse>(`/api/upgrades?library=${library}`), [library]);
  const { data, error, loading, reload } = useLoad(load);
  const router = useRouter();
  useReleasesChanged(() => void reload());
  // Releases stored before sizes were get theirs with a releases sync.
  const sync = useSyncNow("releases", reload);

  if (loading && !data) {
    return (
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
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
      {error || sync.error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{sync.error || `Failed to load: ${error}`}</AlertDescription>
        </Alert>
      ) : null}
      {data.sizesPending ? (
        <SyncNotice onSync={sync.sync} syncing={sync.syncing}>
          Some groups haven&apos;t loaded all their releases yet; the next releases sync fetches the rest.
        </SyncNotice>
      ) : null}

      <SwitchView library={library} data={data} onOpen={(href) => router.push(href)} />
    </>
  );
}
