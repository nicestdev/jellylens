"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { AlertCircle, Globe, ListChecks, Lock, RefreshCw, Server, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, relativeTime, type SyncStatus } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Intervals = { jellyfin: number; tmdb: number; missing: number };
type Config = {
  jellyfinUrl: string;
  jellyfinApiKey: string;
  tmdbApiKey: string;
  authEnabled: boolean;
  intervals: Intervals;
};

// Hours; 0 means the automatic schedule is off (manual "Sync now" only).
function intervalLabel(hours: number): string {
  if (hours === 0) return "Off";
  if (hours === 1) return "Every hour";
  if (hours === 24) return "Every day";
  if (hours === 168) return "Every week";
  if (hours % 24 === 0) return `Every ${hours / 24} days`;
  return `Every ${hours} hours`;
}

// Both sections are configured through env vars, so both headings say so.
function ReadOnlyHeading({ title, className }: { title: string; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground", className)}>
      <h2>{title}</h2>
      <span className="flex items-center gap-1 text-xs font-normal">
        · <Lock className="size-3" /> read-only, set via environment variables
      </span>
    </div>
  );
}

// Long env names like MISSING_RECHECK_INTERVAL_HOURS don't fit beside the
// button on a phone; let them wrap after an underscore instead of overflowing.
function BreakableName({ name }: { name: string }) {
  return name.split("_").map((part, i, parts) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? (
        <>
          _<wbr />
        </>
      ) : null}
    </Fragment>
  ));
}

type Stage = {
  key: keyof Intervals;
  icon: LucideIcon;
  title: string;
  description: string;
  detail: string;
  syncedAt: string | null;
  path: string;
  env: string;
};

export default function SettingsPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([apiFetch<SyncStatus>("/api/status"), apiFetch<Config>("/api/config")]);
      setStatus(s);
      setConfig(c);
    } catch (e) {
      setError(`Failed to load settings: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function trigger(key: string, path: string) {
    setError("");
    setBusy(key);
    try {
      await apiFetch(path, { method: "POST" });
      await load();
    } catch (e) {
      setError(`Sync failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const stages: Stage[] = [
    {
      key: "jellyfin",
      icon: Server,
      title: "Jellyfin",
      description: "Pulls movies, shows and episodes from your Jellyfin server.",
      detail: status ? `${status.jellyfin.movies} movies · ${status.jellyfin.shows} shows` : "",
      syncedAt: status?.jellyfin.syncedAt ?? null,
      path: "/api/sync/jellyfin",
      env: "JELLYFIN_SYNC_INTERVAL_HOURS",
    },
    {
      key: "tmdb",
      icon: Globe,
      title: "TMDB",
      description: "Pulls season and episode air dates for matched shows, then rechecks missing episodes.",
      detail: status ? `${status.tmdb.shows} shows matched` : "",
      syncedAt: status?.tmdb.syncedAt ?? null,
      path: "/api/sync/tmdb",
      env: "TMDB_SYNC_INTERVAL_HOURS",
    },
    {
      key: "missing",
      icon: ListChecks,
      title: "Missing episodes",
      description: "Recomputes missing episodes and mismatches from the cached data — no network calls.",
      detail: status
        ? `${status.missing.incompleteCount} incomplete shows · ${status.mismatches.mismatchCount} mismatches`
        : "",
      syncedAt: status?.missing.syncedAt ?? null,
      path: "/api/recheck-missing",
      env: "MISSING_RECHECK_INTERVAL_HOURS",
    },
  ];

  const loading = !status || !config;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sync sources and how often they run.</p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ReadOnlyHeading title="Sync" className="mt-6" />
      <div className="space-y-3">
        {stages.map((stage) => {
          const Icon = stage.icon;
          const running = busy === stage.key;
          return (
            <section
              key={stage.key}
              className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 gap-3.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{stage.title}</h3>
                  <p className="text-sm text-muted-foreground">{stage.description}</p>
                  {loading ? (
                    <Skeleton className="mt-2 h-3 w-48" />
                  ) : (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {stage.detail} · {stage.syncedAt ? `synced ${relativeTime(stage.syncedAt)}` : "never synced"}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-4 sm:shrink-0 sm:justify-end">
                {/* Same label-over-env-name pair as the Server rows below. */}
                <div className="min-w-0 sm:text-right">
                  {config ? (
                    <div className="text-sm">{intervalLabel(config.intervals[stage.key])}</div>
                  ) : (
                    <Skeleton className="mb-1 h-4 w-24 sm:ml-auto" />
                  )}
                  <div className="font-mono text-[11px] text-muted-foreground/70">
                    <BreakableName name={stage.env} />
                  </div>
                </div>
                <Button variant="outline" onClick={() => trigger(stage.key, stage.path)} disabled={running}>
                  <RefreshCw className={cn(running && "animate-spin")} />
                  {running ? "Syncing…" : "Sync now"}
                </Button>
              </div>
            </section>
          );
        })}
      </div>

      <ReadOnlyHeading title="Server" className="mt-10" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {[
          {
            title: "Jellyfin",
            icon: Server,
            rows: [
              { label: "Server", env: "JELLYFIN_URL", value: config?.jellyfinUrl },
              { label: "API key", env: "JELLYFIN_API_KEY", value: config?.jellyfinApiKey },
              { label: "Sign-in", env: "AUTH_ENABLED", value: config ? (config.authEnabled ? "Jellyfin accounts" : "Off") : undefined },
            ],
          },
          {
            title: "TMDB",
            icon: Globe,
            rows: [{ label: "API key", env: "TMDB_API_KEY", value: config?.tmdbApiKey }],
          },
        ].map((group) => {
          const Icon = group.icon;
          return (
            <section key={group.title} className="rounded-xl border bg-card">
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Icon className="size-4" />
                </span>
                <h3 className="text-sm font-medium">{group.title}</h3>
              </div>
              <dl className="divide-y">
                {group.rows.map((row) => (
                  <div key={row.env} className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="shrink-0">
                      <div className="text-sm text-muted-foreground">{row.label}</div>
                      <div className="font-mono text-[11px] text-muted-foreground/70">{row.env}</div>
                    </dt>
                    <dd className="min-w-0 truncate font-mono text-sm">
                      {config ? row.value || "—" : <Skeleton className="h-4 w-40" />}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </main>
  );
}
