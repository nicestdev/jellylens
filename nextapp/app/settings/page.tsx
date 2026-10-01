"use client";

import { Fragment, useEffect, useState } from "react";
import {
  AlertCircle,
  FileText,
  Globe,
  ListChecks,
  Lock,
  PackageSearch,
  RefreshCw,
  Server,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ReleaseGroups } from "./release-groups";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, runSync } from "@/lib/api-client";
import { plural, relativeTime } from "@/lib/format";
import type { ConfigResponse, Preferences, StatusResponse, SyncStageName } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { cn } from "@/lib/utils";


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
  key: SyncStageName;
  icon: LucideIcon;
  title: string;
  description: string;
  detail: string;
  env: string;
};

async function loadSettings() {
  const [status, config, prefs] = await Promise.all([
    apiFetch<StatusResponse>("/api/status"),
    apiFetch<ConfigResponse>("/api/config"),
    apiFetch<Preferences>("/api/preferences"),
  ]);
  return { status, config, prefs };
}

export default function SettingsPage() {
  const page = useLoad(loadSettings);
  const status = page.data?.status ?? null;
  const config = page.data?.config ?? null;
  const prefs = page.data?.prefs ?? null;
  // The stage a "Sync now" here is waiting on.
  const [busy, setBusy] = useState<SyncStageName | null>(null);
  // Errors of what the user just did; the load's own error shows otherwise.
  const [actionError, setError] = useState("");
  const error = actionError || (page.error && `Failed to load settings: ${page.error}`);
  const setPrefs = (next: Preferences) => page.setData((data) => data && { ...data, prefs: next });
  const reload = page.reload;

  // A sync that started elsewhere (on schedule, at boot, by adding a
  // release group) shows as running too; the page checks back until it's done.
  const runningElsewhere = status && !busy && Object.values(status).some((s) => s.running);
  useEffect(() => {
    if (!runningElsewhere) return;
    const timer = setTimeout(reload, 3000);
    return () => clearTimeout(timer);
  }, [runningElsewhere, status, reload]);

  // Flips the switch right away and rolls back if saving fails.
  async function setPref(changes: Partial<Preferences>) {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, ...changes });
    try {
      setPrefs(
        await apiFetch<Preferences>("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        })
      );
    } catch (e) {
      setPrefs(before);
      setError(`Couldn't save setting: ${(e as Error).message}`);
    }
  }

  async function trigger(stage: SyncStageName) {
    setError("");
    setBusy(stage);
    try {
      await runSync(stage);
    } catch (e) {
      setError(`Sync failed: ${(e as Error).message}`);
    } finally {
      await reload();
      setBusy(null);
    }
  }

  const stages: Stage[] = [
    {
      key: "jellyfin",
      icon: Server,
      title: "Jellyfin",
      description: "Pulls movies, shows and episodes from your Jellyfin server, then rechecks what's missing.",
      detail: status ? `${status.jellyfin.movies} movies · ${status.jellyfin.shows} shows` : "",
      env: "JELLYFIN_SYNC_INTERVAL_HOURS",
    },
    {
      key: "tmdb",
      icon: Globe,
      title: "TMDB",
      description:
        "Pulls season and episode air dates for matched shows and the movie collections you own parts of, then rechecks what's missing.",
      detail: status ? `${plural(status.tmdb.shows, "show")} matched · ${plural(status.tmdb.collections, "collection")}` : "",
      env: "TMDB_SYNC_INTERVAL_HOURS",
    },
    {
      key: "missing",
      icon: ListChecks,
      title: "Missing episodes & movies",
      description: "Recomputes missing episodes, collection movies and mismatches from the cached data — no network calls.",
      detail: status
        ? `${plural(status.missing.incompleteCount, "incomplete show")} · ${plural(status.missing.incompleteCollectionCount, "incomplete collection")} · ${plural(status.missing.mismatchCount, "mismatch")}`
        : "",
      env: "MISSING_RECHECK_INTERVAL_HOURS",
    },
    {
      key: "releases",
      icon: PackageSearch,
      title: "xREL releases",
      description: "Pulls new P2P releases of your release groups from xREL.",
      detail: status
        ? `${plural(status.releases.groups, "group")} · ${plural(status.releases.releases, "release")}`
        : "",
      env: "XREL_SYNC_INTERVAL_HOURS",
    },
  ];


  const loading = !status || !config;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sync sources, how often they run, display options and release groups.</p>
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
          const running = busy === stage.key || Boolean(status?.[stage.key].running);
          const syncedAt = status?.[stage.key].syncedAt ?? null;
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
                      {stage.detail} · {syncedAt ? `synced ${relativeTime(syncedAt)}` : "never synced"}
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
                <Button variant="outline" onClick={() => trigger(stage.key)} disabled={running}>
                  <RefreshCw className={cn(running && "animate-spin")} />
                  {running ? "Syncing…" : "Sync now"}
                </Button>
              </div>
            </section>
          );
        })}
      </div>

      {/* Unlike the read-only sections, this one and Release groups are changed right here. */}
      <h2 className="mt-10 mb-3 text-sm font-medium text-muted-foreground">Display</h2>
      <section className="rounded-xl border bg-card">
        <label className="flex cursor-pointer items-center gap-3.5 p-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <FileText className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">File names on missing movies</span>
            <span className="block text-sm text-muted-foreground">
              Shows the files you own on each collection card, so you can get the missing parts from the same release
              group.
            </span>
          </span>
          {prefs ? (
            <Switch
              checked={prefs.showFileNames}
              onCheckedChange={(checked) => setPref({ showFileNames: checked })}
              aria-label="File names on missing movies"
            />
          ) : (
            <Skeleton className="h-[18px] w-8 rounded-full" />
          )}
        </label>
      </section>

      <h2 className="mt-10 mb-3 text-sm font-medium text-muted-foreground">Release groups</h2>
      <ReleaseGroups onError={setError} onChange={reload} />

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
