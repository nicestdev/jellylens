"use client";

import { useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { CELL, DataTable, MUTED_CELL, NOT_ON_PHONE, ROW } from "@/components/library-table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ReleaseGroups } from "./release-groups";
import { SlotsMenu } from "./download-slots";
import { ArchivePasswords } from "./archive-passwords";
import { SectionTitle } from "@/components/section-title";
import { Breakable } from "@/components/breakable";
import { LIST, pollDelay, SECTION } from "./logic";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, runSync, jsonRequest } from "@/lib/api-client";
import { plural, relativeTime } from "@/lib/format";
import type {
  ConfigResponse,
  DownloadsResponse,
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

function EnvRow({ env, value }: { env: string; value: string | undefined }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
      <dt className="min-w-0 font-mono text-xs text-muted-foreground">
        <Breakable text={env} separator="_" />
      </dt>
      <dd className="shrink-0">{value !== undefined ? value || "—" : <Skeleton className="h-4 w-24" />}</dd>
    </div>
  );
}

function PrefRow({
  title,
  text,
  checked,
  onChange,
}: {
  title: string;
  text: string;
  checked: boolean | undefined;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
      {checked !== undefined ? (
        <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
      ) : (
        <Skeleton className="h-[1.15rem] w-8 rounded-full" />
      )}
    </label>
  );
}

// The sync stages, a row each: what it holds, its schedule (the env
// variable behind it on hover), when it last ran, and Sync now.
const STAGES: { stage: SyncStageName; title: string; env: string; counts: (s: StatusResponse) => string }[] = [
  {
    stage: "library",
    title: "Library",
    env: "LIBRARY_SCAN_INTERVAL_HOURS",
    counts: (s) => `${plural(s.library.movies, "movie")} · ${plural(s.library.shows, "show")}`,
  },
  {
    stage: "tmdb",
    title: "TMDB",
    env: "TMDB_SYNC_INTERVAL_HOURS",
    counts: (s) => `${plural(s.tmdb.shows, "show")} · ${plural(s.tmdb.collections, "collection")}`,
  },
  {
    stage: "releases",
    title: "xREL",
    env: "XREL_SYNC_INTERVAL_HOURS",
    counts: (s) => `${plural(s.releases.groups, "group")} · ${plural(s.releases.releases, "release")}`,
  },
  {
    stage: "missing",
    title: "Missing",
    env: "MISSING_RECHECK_INTERVAL_HOURS",
    counts: (s) =>
      `${plural(s.missing.incompleteCount, "show")} · ${plural(s.missing.incompleteCollectionCount, "collection")}`,
  },
];

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

  // Live: counts, groups and "synced …" move along with a running sync.
  usePoll(reload, pollDelay({ busy: Boolean(busy), status, groups }));

  // Flips the switch right away and rolls back if saving fails.
  async function setPref(changes: Partial<Preferences>) {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, ...changes });
    try {
      setPrefs(await apiFetch<Preferences>("/api/preferences", jsonRequest("PATCH", changes)));
    } catch (e) {
      setPrefs(before);
      setError(`Couldn't save setting: ${(e as Error).message}`);
    }
  }

  // Saved right away; the queue fills the new slots (or lets running files
  // finish when there are fewer).
  async function setSlots(slots: number) {
    setError("");
    try {
      const next = await apiFetch<DownloadsResponse>("/api/downloads", jsonRequest("PATCH", { slots }));
      page.setData((data) => data && { ...data, config: { ...data.config, downloadSlots: next.slots } });
    } catch (e) {
      setError(`Couldn't save setting: ${(e as Error).message}`);
    }
  }

  // The whole list, saved as it's changed; the page keeps what the server
  // stored (blank and repeated ones dropped).
  async function savePasswords(passwords: string[]) {
    await apiFetch<DownloadsResponse>("/api/downloads", jsonRequest("PATCH", { passwords }));
    const stored = await apiFetch<ConfigResponse>("/api/config");
    page.setData((data) => data && { ...data, config: { ...data.config, passwords: stored.passwords } });
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

  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sync, release groups, downloads and display options.</p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className={cn("mt-6", SECTION)}>
        <SectionTitle hint="Each runs on its schedule; Sync now runs one right away.">Sync</SectionTitle>
        <DataTable
          flat
          columns={[
            { label: "Source" },
            { label: "Contents", stretch: true, phone: false },
            { label: "Schedule", phone: false },
            { label: "Last sync", phone: false },
            { label: "Sync now", hidden: true },
          ]}
        >
          {STAGES.map((st) => {
            const running = busy === st.stage || Boolean(status?.[st.stage].running);
            const syncedAt = status?.[st.stage].syncedAt ?? null;
            const contents = status ? st.counts(status) : <Skeleton className="inline-block h-4 w-40" />;
            const schedule = config ? (
              intervalLabel(config.intervals[st.stage])
            ) : (
              <Skeleton className="inline-block h-4 w-20" />
            );
            const lastSync = loading ? (
              <Skeleton className="inline-block h-4 w-20" />
            ) : running ? (
              "syncing…"
            ) : (
              relativeTime(syncedAt)
            );
            return (
              <tr key={st.stage} className={ROW}>
                {/* On a phone contents, schedule and last sync are lines
                    under the source. */}
                <td className={cn(CELL, "max-sm:w-full max-sm:max-w-0")}>
                  <div className="font-medium">{st.title}</div>
                  <div className="truncate text-xs text-muted-foreground sm:hidden">{contents}</div>
                  <div className="truncate text-xs text-muted-foreground sm:hidden">
                    {schedule} · {lastSync}
                  </div>
                </td>
                <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>{contents}</td>
                <td className={cn(MUTED_CELL, NOT_ON_PHONE)} title={st.env}>
                  {schedule}
                </td>
                <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>{lastSync}</td>
                <td className={cn(CELL, "py-0 text-right")}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => trigger(st.stage)}
                    disabled={running}
                    aria-label={`Sync ${st.title} now`}
                  >
                    <RefreshCw className={cn(running && "animate-spin")} />
                    Sync now
                  </Button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </section>

      <ReleaseGroups
        data={groups}
        onData={(next) => {
          page.setData((d) => d && { ...d, groups: next });
          reload(); // the xREL tile's counts
        }}
        onError={setError}
      />

      <div className="mt-3 flex flex-col gap-3">
        <section className={SECTION}>
          <SectionTitle>Display</SectionTitle>
          <div className={LIST}>
            <PrefRow
              title="Releases below 720p"
              text="Shows XviD, SD and DVD releases on the Releases page. When off, titles with nothing else are not checked on TMDB either."
              checked={prefs?.showSdReleases}
              onChange={(checked) => setPref({ showSdReleases: checked })}
            />
          </div>
        </section>

        <section className={SECTION}>
          <SectionTitle>Downloads</SectionTitle>
          <div className={LIST}>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Parallel downloads</span>
                <span className="block text-xs text-muted-foreground">
                  How many files come in at once. Fewer takes effect as running ones finish.
                </span>
              </span>
              {config ? (
                <SlotsMenu slots={config.downloadSlots} maxSlots={config.maxDownloadSlots} onChange={setSlots} />
              ) : (
                <Skeleton className="h-8 w-32" />
              )}
            </div>
          </div>
        </section>

        <ArchivePasswords passwords={config?.passwords ?? null} save={savePasswords} onError={setError} />

        {/* Read-only: all of this is set through environment variables. */}
        <section className={SECTION}>
          <SectionTitle hint="Set in the container's environment; read-only here.">Environment</SectionTitle>
          <dl className={LIST}>
            <EnvRow env="JELLYFIN_URL" value={config?.jellyfinUrl} />
            <EnvRow env="JELLYFIN_API_KEY" value={config?.jellyfinApiKey} />
            <EnvRow
              env="AUTH_ENABLED"
              value={config ? (config.authEnabled ? "Jellyfin accounts" : "Off") : undefined}
            />
            <EnvRow env="TMDB_API_KEY" value={config?.tmdbApiKey} />
            <EnvRow env="TMDB_LANGUAGE" value={config?.tmdbLanguage} />
            <EnvRow env="DDOWNLOAD_LOGIN" value={config?.ddownloadLogin} />
            <EnvRow env="DDOWNLOAD_PASSWORD" value={config?.ddownloadPassword} />
            <EnvRow env="REALDEBRID_TOKEN" value={config?.realDebridToken} />
            <EnvRow
              env="ARCHIVE_PASSWORDS"
              value={config ? (config.archivePasswords ? plural(config.archivePasswords, "password") : "") : undefined}
            />
            <EnvRow env="DOWNLOAD_DIR" value={config?.downloadDir} />
          </dl>
        </section>
      </div>
    </main>
  );
}
