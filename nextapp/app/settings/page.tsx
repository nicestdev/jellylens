"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { StatTile } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ReleaseGroups } from "./release-groups";
import { SlotsMenu } from "./download-slots";
import { ArchivePasswords } from "./archive-passwords";
import { IgnoredShows } from "./ignored-shows";
import { SectionFrame, FRAME_LIST } from "@/components/section-frame";
import { Breakable } from "@/components/breakable";
import { pollDelay } from "./logic";
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
  // Always in hours, as the env vars set them ("Every 24 hours").
  return hours === 1 ? "Every hour" : `Every ${hours} hours`;
}

function EnvRow({ env, value }: { env: string; value: string | undefined }) {
  return (
    <div className="flex h-9 items-center justify-between gap-4 px-3 text-[0.8125rem]">
      <dt className="min-w-0 font-mono text-xs text-muted-foreground">
        <Breakable text={env} separator="_" />
      </dt>
      <dd className="shrink-0 font-mono text-xs">
        {value !== undefined ? value || "—" : <Skeleton className="h-4 w-24" />}
      </dd>
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
      <span className="min-w-0 flex-1 text-[0.8125rem] font-medium">{title}</span>
      {checked !== undefined ? (
        <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
      ) : (
        <Skeleton className="h-[1.15rem] w-8 rounded-full" />
      )}
    </label>
  );
}

// The sync stages, a card each: when it last ran, its schedule, and Sync.
const STAGES: { stage: SyncStageName; title: string }[] = [
  { stage: "library", title: "Library" },
  { stage: "tmdb", title: "TMDB" },
  { stage: "releases", title: "xREL" },
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

      {/* A card each: when it last synced, its schedule under it, and
          its Sync (spinning while it runs). One under another on a phone. */}
      <div className="mt-4 grid gap-4 sm:mt-6 sm:grid-cols-3 sm:gap-6 phone-landscape:grid-cols-3">
        {STAGES.map((st) => {
          const running = busy === st.stage || Boolean(status?.[st.stage].running);
          const syncedAt = status?.[st.stage].syncedAt ?? null;
          return (
            <StatTile
              key={st.stage}
              label={st.title}
              value={relativeTime(syncedAt)}
              muted={!syncedAt}
              hint={config ? [intervalLabel(config.intervals[st.stage])] : undefined}
              loading={loading || !config}
              action={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  onClick={() => trigger(st.stage)}
                  disabled={running}
                  aria-label={`Sync ${st.title}`}
                >
                  <RefreshCw className={cn(running && "animate-spin")} />
                </Button>
              }
            />
          );
        })}
      </div>

      {/* Two columns, half and half like Analytics', from xl and on a phone on
          its side: the release groups, ignored shows and the environment on
          the left, what's set here on the right. */}
      <div className="mt-4 grid items-start gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-2 phone-landscape:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          <ReleaseGroups
            data={groups}
            onData={(next) => {
              page.setData((d) => d && { ...d, groups: next });
              reload(); // a new group starts the releases sync
            }}
            onError={setError}
          />

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

        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          <SectionFrame title="Options">
            <div className={FRAME_LIST}>
              <PrefRow
                title="Releases below 720p"
                checked={prefs?.showSdReleases}
                onChange={(checked) => setPref({ showSdReleases: checked })}
              />
              <div className="flex h-11 items-center gap-3 px-3">
                <span className="min-w-0 flex-1 text-[0.8125rem] font-medium">Parallel downloads</span>
                {config ? (
                  <SlotsMenu slots={config.downloadSlots} maxSlots={config.maxDownloadSlots} onChange={setSlots} />
                ) : (
                  <Skeleton className="h-5 w-16" />
                )}
              </div>
            </div>
          </SectionFrame>

          <ArchivePasswords passwords={config?.passwords ?? null} save={savePasswords} onError={setError} />
        </div>
      </div>
    </main>
  );
}
