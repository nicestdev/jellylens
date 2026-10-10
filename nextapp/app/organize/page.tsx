"use client";

import { useEffect, useState } from "react";
import { AlertCircle, FolderInput, ListX, RefreshCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { DataTable } from "@/components/library-table";
import { SectionTitle } from "@/components/section-title";
import { PageMenu } from "@/components/page-menu";
import { StatTile } from "@/components/stat-tile";
import { COUNTS_STALE, apiFetch, jsonRequest } from "@/lib/api-client";
import type { OrganizeItem, OrganizeResponse, OrganizeScan } from "@/lib/api-types";
import { formatBytes } from "@/lib/format";
import { useLoad } from "@/hooks/use-load";
import { usePoll } from "@/hooks/use-poll";
import { ORGANIZE_COLUMNS, OrganizeRow, MovedRow } from "./organize-row";
import { organizeGroups, isMoving, targetOf } from "./logic";

const loadScan = () => apiFetch<OrganizeScan>("/api/organize/scan");

const loadOrganize = () => apiFetch<OrganizeResponse>("/api/organize");

// Finished downloads into the library, by hand: each goes to the disk
// picked, into its title's folder ("Name (Year) [tmdbid-N]")
// (lib/library-move.ts); the disks' free space on top, then New, Running
// and Finished like Downloads (Finished until Clear forgets it).
export default function OrganizePage() {
  const page = useLoad(loadOrganize);
  const data = page.data;
  const [actionError, setError] = useState("");
  // The sidebar's Organize count follows what's here (asked for again only
  // when how many there are to organize changes, not on every poll).
  const toOrganize = data?.items.length;
  useEffect(() => {
    if (toOrganize !== undefined) window.dispatchEvent(new Event(COUNTS_STALE));
  }, [toOrganize]);
  const error = actionError || (page.error && `Failed to load: ${page.error}`);
  usePoll(page.reload, data && isMoving(data) ? 1000 : 10000);

  // Moves a package (POST) or clears Done (DELETE); the page comes back.
  async function send(init: RequestInit) {
    setError("");
    try {
      page.setData(await apiFetch<OrganizeResponse>("/api/organize", init));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const move = (id: number, target: string, replace?: boolean) => send(jsonRequest("POST", { id, target, replace }));
  const clear = () => send({ method: "DELETE" });
  // Delete: a download the library has already, its files too.
  async function remove(id: number) {
    setError("");
    try {
      await apiFetch(`/api/downloads/${id}?files=delete`, { method: "DELETE" });
      page.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // The library scan: asked for on load and every 10 s, only whether it
  // runs (its note once it's done comes from the server, lib/rescan.ts).
  const scanPage = useLoad(loadScan);
  const scanning = scanPage.data?.running ?? false;
  usePoll(scanPage.reload, 10000);
  async function scan() {
    setError("");
    try {
      scanPage.setData(await apiFetch<OrganizeScan>("/api/organize/scan", { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // The disk picked per item (its path), so Move all takes it too.
  const [picked, setPicked] = useState<Record<number, string>>({});
  // Move all: each new one that can be moved, to its disk, one after
  // another; not what the library has already (Replace or Add as version,
  // one by one).
  const movable = (item: OrganizeItem) => !item.error && !item.owned.length && targetOf(item, picked[item.id]);
  // New's (not moving yet).
  const fresh = data?.items.filter((i) => !i.move) ?? [];
  async function moveAll(items: OrganizeItem[]) {
    for (const item of items) {
      const target = movable(item);
      if (target) await move(item.id, target.path);
    }
  }

  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      {/* The page's ⋯ at the right of the heading, like Downloads': Rescan
          library (the library scan, and Jellyfin's, lib/rescan.ts; it runs
          on its own after moves too; "Scanning…" while it runs, a note says
          when it's done), Move all and Clear finished. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Organize</h1>
          <p className="mt-1 text-sm text-muted-foreground">Moves finished downloads into the library.</p>
        </div>
        <PageMenu
          groups={[
            [
              {
                icon: RefreshCcw,
                label: scanning ? "Scanning…" : "Rescan library",
                onClick: scan,
                disabled: scanning,
              },
            ],
            [
              ...(fresh.length
                ? [
                    {
                      icon: FolderInput,
                      label: "Move all",
                      onClick: () => moveAll(fresh),
                      disabled: !fresh.some(movable),
                    },
                  ]
                : []),
              ...(data?.moved.some((m) => !m.move) ? [{ icon: ListX, label: "Clear finished", onClick: clear }] : []),
            ],
          ]}
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
            {data.libraryDir
              ? `No disks in ${data.libraryDir}.`
              : "Set LIBRARY_DIR to the library's disks (each with movies/ and shows/)."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {data
          ? data.disks.map((d) => (
              <StatTile
                key={d.disk}
                label={d.disk}
                value={d.freeBytes !== null ? formatBytes(d.freeBytes) : "?"}
                hint={d.totalBytes ? `free of ${formatBytes(d.totalBytes)}` : "not readable"}
              />
            ))
          : [0, 1, 2, 3].map((i) => <StatTile key={i} label="" value="" hint="" loading />)}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {!data ? (
          <Skeleton className="h-14 rounded-lg" />
        ) : !data.items.length && !data.moved.length ? (
          <EmptyState icon={FolderInput} title="Nothing to organize" hint="Finished downloads show up here." />
        ) : (
          organizeGroups(data).map((group) => (
            <section key={group.title} className="overflow-hidden rounded-lg border bg-card p-3 pb-0">
              <SectionTitle>{group.title}</SectionTitle>
              <DataTable flat columns={ORGANIZE_COLUMNS}>
                {group.items.map((item) => (
                  <OrganizeRow
                    key={item.id}
                    item={item}
                    picked={picked[item.id]}
                    onPick={(target) => setPicked((p) => ({ ...p, [item.id]: target }))}
                    onMove={(target, replace) => move(item.id, target, replace)}
                    onDelete={() => remove(item.id)}
                  />
                ))}
                {group.moved.map((item) => (
                  <MovedRow
                    key={item.id}
                    item={item}
                    onUndo={() => send(jsonRequest("POST", { id: item.id, undo: true }))}
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
