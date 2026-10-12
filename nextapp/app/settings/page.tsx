"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { CELL, MUTED_CELL, NOT_ON_PHONE, ROW, TITLE_CELL } from "@/components/library-table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ReleaseGroups } from "./release-groups";
import { SlotsMenu } from "./download-slots";
import { ArchivePasswords } from "./archive-passwords";
import { IgnoredShows } from "./ignored-shows";
import { SectionFrame, FRAME_LIST, TableFrame } from "@/components/section-frame";
import { Breakable } from "@/components/breakable";
import { pollDelay, SETTINGS_COLUMNS } from "./logic";
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
import { ErrorAlert } from "@/components/error-alert";

// Hours; 0 means the automatic schedule is off (manual "Sync" only).
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
    <div className="flex h-9 items-center justify-between gap-4 px-3 text-sm">
      <dt className="min-w-0 font-mono text-xs text-muted-foreground">
        <Breakable text={env} separator="_" />
      </dt>
      <dd className="shrink-0">{value !== undefined ? value || "—" : <Skeleton className="h-4 w-24" />}</dd>
    </div>
  );
}

function PrefRow({
  title,
  checked,
  onChange,
}: {
  title: string;
  checked: boolean | undefined;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-11 cursor-pointer items-center gap-3 px-3 transition-colors hover:bg-muted/40">
      <span className="min-w-0 flex-1 text-sm font-medium">{title}</span>
      {checked !== undefined ? (
        <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
      ) : (
        <Skeleton className="h-[1.15rem] w-8 rounded-full" />
      )}
    </label>
  );
}

// The sync stages, a row each: its schedule, when it last ran, and Sync.
const STAGES: { stage: SyncStageName; title: string }[] = [
  { stage: "library", title: "Library" },
  { stage: "tmdb", title: "TMDB" },
  { stage: "releases", title: "xREL" },
  { stage: "missing", title: "Missing" },
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
  const groups = page.data?.groups ?? null;
  const config = page.data?.config ?? null;
  const prefs = page.data?.prefs ?? null;
  // The stage a "Sync" here is waiting on.
  const [busy, setBusy] = useState<SyncStageName | null>(null);
  // Errors of what the user just did; the load's own error shows otherwise.
  const [actionError, setError] = useState("");
  const error = actionError || (page.error && `Failed to load settings: ${page.error}`);
  const setPrefs = (change: Partial<Preferences>) =>
    page.setData((data) => data && { ...data, prefs: { ...data.prefs, ...change } });
  const reload = page.reload;

  // Live: groups and "synced …" move along with a running sync.
  usePoll(reload, pollDelay({ busy: Boolean(busy), status, groups }));

  // Flips the switch right away and rolls back just that if saving fails.
  async function setPref(changes: Partial<Preferences>) {
    if (!prefs) return;
    const before = Object.fromEntries(Object.keys(changes).map((k) => [k, prefs[k as keyof Preferences]]));
    setPrefs(changes);
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
      <h1 className="text-3xl font-semibold max-md:sr-only">Settings</h1>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      {/* Two columns from xl: what syncs on the left, what's set on the right. */}
      <div className="mt-6 grid items-start gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <TableFrame
            title="Sync"
            minWidth="min-w-0"
            columns={[
              { label: "Source", stretch: true },
              { label: "Schedule", width: SETTINGS_COLUMNS.middle, phone: false },
              { label: "Last sync", width: SETTINGS_COLUMNS.lastSync, phone: false },
              { label: "Sync", hidden: true, width: SETTINGS_COLUMNS.action },
            ]}
          >
            {STAGES.map((st) => {
              const running = busy === st.stage || Boolean(status?.[st.stage].running);
              const syncedAt = status?.[st.stage].syncedAt ?? null;
              const schedule = config ? (
                intervalLabel(config.intervals[st.stage])
              ) : (
                <Skeleton className="inline-block h-4 w-20" />
              );
              // While it runs, the spinning Sync button says so.
              const lastSync = loading ? <Skeleton className="inline-block h-4 w-20" /> : relativeTime(syncedAt);
              return (
                <tr key={st.stage} className={ROW}>
                  {/* On a phone schedule and last sync are a line under the source. */}
                  <td className={TITLE_CELL}>
                    <div className="font-medium">{st.title}</div>
                    <div className="truncate text-xs text-muted-foreground sm:hidden">
                      {schedule} · {lastSync}
                    </div>
                  </td>
                  <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>{schedule}</td>
                  <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>{lastSync}</td>
                  <td className={cn(CELL, "py-0 text-right")}>
                    {/* Just the icon, like the groups' ⋯ below, so the tables'
                          columns line up. */}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="align-middle text-muted-foreground"
                      onClick={() => trigger(st.stage)}
                      disabled={running}
                      aria-label={`Sync ${st.title}`}
                    >
                      <RefreshCw className={cn(running && "animate-spin")} />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </TableFrame>

          <ReleaseGroups
            data={groups}
            onData={(next) => {
              page.setData((d) => d && { ...d, groups: next });
              reload(); // a new group starts the releases sync
            }}
            onError={setError}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <SectionFrame title="Options">
            <div className={FRAME_LIST}>
              <PrefRow
                title="Releases below 720p"
                checked={prefs?.showSdReleases}
                onChange={(checked) => setPref({ showSdReleases: checked })}
              />
              <div className="flex h-11 items-center gap-3 px-3">
                <span className="min-w-0 flex-1 text-sm font-medium">Parallel downloads</span>
                {config ? (
                  <SlotsMenu slots={config.downloadSlots} maxSlots={config.maxDownloadSlots} onChange={setSlots} />
                ) : (
                  <Skeleton className="h-5 w-16" />
                )}
              </div>
            </div>
          </SectionFrame>

          <ArchivePasswords passwords={config?.passwords ?? null} save={savePasswords} onError={setError} />

          <IgnoredShows onError={setError} />

          {/* Read-only: all of this is set through environment variables. */}
          <SectionFrame title="Environment">
            <dl className={FRAME_LIST}>
              <EnvRow env="JELLYFIN_URL" value={config?.jellyfinUrl} />
              <EnvRow env="JELLYFIN_API_KEY" value={config?.jellyfinApiKey} />
              <EnvRow
                env="AUTH_ENABLED"
                value={config ? (config.authEnabled ? "Jellyfin accounts" : "Off") : undefined}
              />
              <EnvRow env="TMDB_API_KEY" value={config?.tmdbApiKey} />
              <EnvRow env="TMDB_LANGUAGE" value={config?.tmdbLanguage} />
              <EnvRow
                env="P2P_GROUPS"
                value={config ? (config.p2pGroups ? plural(config.p2pGroups, "group") : "") : undefined}
              />
              <EnvRow
                env="SCENE_GROUPS"
                value={config ? (config.sceneGroups ? plural(config.sceneGroups, "group") : "") : undefined}
              />
              <EnvRow env="DDOWNLOAD_LOGIN" value={config?.ddownloadLogin} />
              <EnvRow env="DDOWNLOAD_PASSWORD" value={config?.ddownloadPassword} />
              <EnvRow env="REALDEBRID_TOKEN" value={config?.realDebridToken} />
              <EnvRow
                env="ARCHIVE_PASSWORDS"
                value={
                  config ? (config.archivePasswords ? plural(config.archivePasswords, "password") : "") : undefined
                }
              />
              <EnvRow env="DOWNLOAD_DIR" value={config?.downloadDir} />
            </dl>
          </SectionFrame>
        </div>
      </div>
    </main>
  );
}
