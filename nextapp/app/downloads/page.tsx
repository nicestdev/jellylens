"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CircleArrowDown, FileDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { DOWNLOADS_CHANGED, apiFetch, jsonRequest } from "@/lib/api-client";
import type { DownloadPackageItem, DownloadsResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { usePoll } from "@/hooks/use-poll";
import { AddControls } from "./add-form";
import { queueItems, type QueueChange } from "./queue-controls";
import { PACKAGE_COLUMNS, PackageRow } from "./package-row";
import { DataTable } from "@/components/library-table";
import { groups, isActive, queueTiles } from "./logic";
import { StatTile } from "@/components/stat-tile";
import { SectionTitle } from "@/components/section-title";

const loadDownloads = () => apiFetch<DownloadsResponse>("/api/downloads");

// DLC containers in, extracted files out: each container's packages come
// in as new ones to look over and start; then they're fetched from
// ddownload one file at a time and their archives extracted into
// DOWNLOAD_DIR (lib/downloader.ts).
export default function DownloadsPage() {
  const page = useLoad(loadDownloads);
  const data = page.data;
  const [actionError, setError] = useState("");
  const error = actionError || (page.error && `Failed to load downloads: ${page.error}`);

  usePoll(page.reload, data && isActive(data.packages) ? 1000 : 10000);
  // The sidebar counts what's new or running.
  useEffect(() => {
    if (data) window.dispatchEvent(new CustomEvent(DOWNLOADS_CHANGED, { detail: data }));
  }, [data]);

  async function act(pkgs: DownloadPackageItem[], init: RequestInit, query = "") {
    setError("");
    try {
      for (const pkg of pkgs) await apiFetch(`/api/downloads/${pkg.id}${query}`, init);
    } catch (e) {
      setError((e as Error).message);
    }
    await page.reload();
  }

  async function changeQueue(change: QueueChange) {
    setError("");
    try {
      page.setData(await apiFetch<DownloadsResponse>("/api/downloads", jsonRequest("PATCH", change)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      {/* The page's ⋯ at the right of the heading: adding packages (pasted
          links open below it), Download all, Pause all and Resume all; how
          many come in at once is on Settings. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Downloads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Fetches and extracts DLCs and links.</p>
        </div>
        <AddControls
          more={
            data
              ? [
                  data.packages.some((p) => p.status === "pending")
                    ? [
                        {
                          icon: CircleArrowDown,
                          label: "Download all",
                          onClick: () =>
                            act(
                              data.packages.filter((p) => p.status === "pending"),
                              jsonRequest("POST", { action: "start" }),
                            ),
                        },
                      ]
                    : [],
                  queueItems(data, changeQueue),
                ]
              : []
          }
          onAdded={page.setData}
          onError={setError}
        />
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {data && !data.ready ? (
        <Alert className="mt-6">
          <AlertCircle />
          <AlertDescription>
            Set DDOWNLOAD_LOGIN and DDOWNLOAD_PASSWORD (a premium account on ddownload.com) or REALDEBRID_TOKEN to fetch
            links.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {data
          ? queueTiles(data).map((t) => <StatTile key={t.label} {...t} />)
          : ["Packages", "Speed", "Left", "Free space"].map((label) => (
              <StatTile key={label} label={label} value="" hint="" loading />
            ))}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {!data ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : data.packages.length === 0 ? (
          <EmptyState
            icon={FileDown}
            title="Drop DLC files anywhere on this page"
            hint={`Or pick them with Upload DLC in the ⋯ at the top. Files are saved to ${data.downloadDir}.`}
          />
        ) : (
          groups(data.packages).map((group) => (
            // Framed like Missing's and Settings' sections, the table flat in it;
            // what acts on all of it in the page's ⋯. No padding below:
            // the last row's own is enough, and its hover reaches the edge.
            <section key={group.title} className="overflow-hidden rounded-lg border bg-card p-3 pb-0">
              <SectionTitle>{group.title}</SectionTitle>
              <DataTable flat columns={PACKAGE_COLUMNS}>
                {group.packages.map((pkg) => (
                  <PackageRow
                    key={pkg.id}
                    pkg={pkg}
                    onAction={(action, options) => act([pkg], jsonRequest("POST", { action, ...options }))}
                    onRemove={() => act([pkg], { method: "DELETE" }, pkg.status === "done" ? "?files=delete" : "")}
                  />
                ))}
              </DataTable>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
