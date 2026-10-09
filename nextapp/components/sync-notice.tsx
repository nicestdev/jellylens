"use client";

import { useState, type ReactNode } from "react";
import { Info, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { runSync } from "@/lib/api-client";
import type { SyncStageName } from "@/lib/api-types";

// A page's own "Sync now" for one stage (Analytics: Jellyfin, Upgrades:
// releases): runs it, then loads the page again either way. error is the
// sync's, for the page's error alert.
export function useSyncNow(stage: SyncStageName, reload: () => Promise<unknown>) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  async function sync() {
    setSyncing(true);
    setError("");
    try {
      await runSync(stage);
    } catch (e) {
      setError(`Sync failed: ${(e as Error).message}`);
    } finally {
      await reload();
      setSyncing(false);
    }
  }
  return { sync, syncing, error };
}

// The note that data is still to come with a sync, and the button that
// starts it now.
export function SyncNotice({
  children,
  onSync,
  syncing,
}: {
  children: ReactNode;
  onSync: () => void;
  syncing: boolean;
}) {
  return (
    <Alert className="mt-6">
      <Info />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{children}</span>
        <Button variant="outline" size="sm" onClick={onSync} disabled={syncing}>
          <RefreshCw className={syncing ? "animate-spin" : undefined} />
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
