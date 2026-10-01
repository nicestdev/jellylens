"use client";

import { Fragment, useState } from "react";
import {
  AlertCircle,
  Globe,
  ListChecks,
  MonitorPlay,
  PackageSearch,
  RefreshCw,
  Server,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ReleaseGroups } from "./release-groups";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, runSync } from "@/lib/api-client";
import { plural, relativeTime } from "@/lib/format";
import type {
  ConfigResponse,
  Preferences,
  ReleaseGroupsResponse,
  StatusResponse,
  SyncStageName,
} from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { usePoll } from "@/hooks/use-poll";
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

// Long env names like MISSING_RECHECK_INTERVAL_HOURS don't fit beside the
// value on a phone; let them wrap after an underscore instead of overflowing.
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

function ConfigRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-mono text-sm">
        {value !== undefined ? value || "—" : <Skeleton className="h-4 w-40" />}
      </dd>
    </div>
  );
}

function EnvRow({ env, value }: { env: string; value: string | undefined }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="min-w-0 font-mono text-sm text-muted-foreground">
        <BreakableName name={env} />
      </dt>
      <dd className="shrink-0 text-sm">
        {value !== undefined ? value || "—" : <Skeleton className="h-4 w-24" />}
      </dd>
    </div>
  );
}

type CardSync = { syncedAt: string | null; running: boolean; loading: boolean; onSync: () => void };

// A card per sync stage, its last sync and "Sync now" in the header, and
// what it holds in the footer; the display options' cards have neither.
function SettingsCard({
  icon: Icon,
  title,
  sync,
  footer,
  children,
}: {
  icon: LucideIcon;
  title: string;
  sync?: CardSync;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-xl border bg-card">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-4" />
        </span>
        <h3 className="flex-1 text-sm font-medium">{title}</h3>
        {sync ? (
          <>
            {sync.loading ? (
              <Skeleton className="h-3 w-24" />
            ) : (
              <span className="text-xs text-muted-foreground">
                {sync.syncedAt ? `synced ${relativeTime(sync.syncedAt)}` : "never synced"}
              </span>
            )}
            <Button variant="outline" onClick={sync.onSync} disabled={sync.running}>
              <RefreshCw className={cn(sync.running && "animate-spin")} />
              {sync.running ? "Syncing…" : "Sync now"}
            </Button>
          </>
        ) : null}
      </div>
      {children}
      {footer ? <div className="border-t px-4 py-2.5">{footer}</div> : null}
    </section>
  );
}

async function loadSettings() {
  const [status, config, prefs, groups] = await Promise.all([
    apiFetch<StatusResponse>("/api/status"),
    apiFetch<ConfigResponse>("/api/config"),
    apiFetch<Preferences>("/api/preferences"),
    apiFetch<ReleaseGroupsResponse>("/api/release-groups"),
  ]);
  return { status, config, prefs, groups };
}

export default function SettingsPage() {
  const page = useLoad(loadSettings);
  const status = page.data?.status ?? null;
  const config = page.data?.config ?? null;
  const prefs = page.data?.prefs ?? null;
  const groups = page.data?.groups ?? null;
  // The stage a "Sync now" here is waiting on.
  const [busy, setBusy] = useState<SyncStageName | null>(null);
  // Errors of what the user just did; the load's own error shows otherwise.
  const [actionError, setError] = useState("");
  const error = actionError || (page.error && `Failed to load settings: ${page.error}`);
  const setPrefs = (next: Preferences) => page.setData((data) => data && { ...data, prefs: next });
  const reload = page.reload;

  // Live: every 2 s while any sync runs (this page's, a scheduled one, one
  // that adding a group started) or a group still has releases to load, so
  // counts, groups and "synced …" move along with it; every 15 s otherwise,
  // to notice one starting.
  const running =
    Boolean(busy) ||
    Boolean(status && Object.values(status).some((s) => s.running)) ||
    Boolean(groups && (groups.matching || groups.Items.some((g) => g.syncing || !g.complete)));
  usePoll(reload, running ? 2000 : 15000);

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

  const loading = !status || !config;

  // The header's last sync and "Sync now", and the footer's counts.
  const sync = (stage: SyncStageName) => ({
    syncedAt: status?.[stage].syncedAt ?? null,
    running: busy === stage || Boolean(status?.[stage].running),
    loading,
    onSync: () => trigger(stage),
  });
  const counts = (text: (s: StatusResponse) => string) =>
    loading ? <Skeleton className="h-3 w-48" /> : <p className="text-xs text-muted-foreground">{text(status!)}</p>;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sync sources, display options and release groups.</p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsCard
        icon={Server}
        title="Jellyfin"
        sync={sync("jellyfin")}
        footer={counts((s) => `${s.jellyfin.movies} movies · ${s.jellyfin.shows} shows`)}
      >
        <dl className="divide-y">
          <ConfigRow label="URL" value={config?.jellyfinUrl} />
          <ConfigRow label="API key" value={config?.jellyfinApiKey} />
        </dl>
      </SettingsCard>

      <SettingsCard
        icon={Globe}
        title="TMDB"
        sync={sync("tmdb")}
        footer={counts((s) => `${plural(s.tmdb.shows, "show")} matched · ${plural(s.tmdb.collections, "collection")}`)}
      >
        <dl className="divide-y">
          <ConfigRow label="API key" value={config?.tmdbApiKey} />
        </dl>
      </SettingsCard>

      {/* Unlike the rest, the groups are changed right here. */}
      <SettingsCard
        icon={PackageSearch}
        title="xREL"
        sync={sync("releases")}
        footer={counts((s) => `${plural(s.releases.groups, "group")} · ${plural(s.releases.releases, "release")}`)}
      >
        <ReleaseGroups
          data={groups}
          onData={(next) => {
            page.setData((d) => d && { ...d, groups: next });
            reload(); // the card's counts
          }}
          onError={setError}
        />
      </SettingsCard>

      <SettingsCard icon={ListChecks} title="Missing" sync={sync("missing")}>
        <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
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
      </SettingsCard>

      <SettingsCard icon={MonitorPlay} title="Releases">
        <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Releases below 720p</span>
            <span className="block text-sm text-muted-foreground">
              Shows XviD, SD and DVD releases on the Releases page. When off, titles with nothing else are not checked
              on TMDB either.
            </span>
          </span>
          {prefs ? (
            <Switch
              checked={prefs.showSdReleases}
              onCheckedChange={(checked) => setPref({ showSdReleases: checked })}
              aria-label="Releases below 720p"
            />
          ) : (
            <Skeleton className="h-[18px] w-8 rounded-full" />
          )}
        </label>
      </SettingsCard>

      {/* Read-only: all of this is set through environment variables. */}
      <SettingsCard icon={Terminal} title="Environment">
        <dl className="divide-y">
          <EnvRow env="JELLYFIN_URL" value={config?.jellyfinUrl} />
          <EnvRow env="JELLYFIN_API_KEY" value={config?.jellyfinApiKey} />
          <EnvRow env="AUTH_ENABLED" value={config ? (config.authEnabled ? "Jellyfin accounts" : "Off") : undefined} />
          <EnvRow env="JELLYFIN_SYNC_INTERVAL_HOURS" value={config ? intervalLabel(config.intervals.jellyfin) : undefined} />
          <EnvRow env="TMDB_API_KEY" value={config?.tmdbApiKey} />
          <EnvRow env="TMDB_SYNC_INTERVAL_HOURS" value={config ? intervalLabel(config.intervals.tmdb) : undefined} />
          <EnvRow env="XREL_SYNC_INTERVAL_HOURS" value={config ? intervalLabel(config.intervals.releases) : undefined} />
          <EnvRow env="MISSING_RECHECK_INTERVAL_HOURS" value={config ? intervalLabel(config.intervals.missing) : undefined} />
        </dl>
      </SettingsCard>
    </main>
  );
}
