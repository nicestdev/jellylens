"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { AlertCircle, CircleArrowDown, FileDown, FolderInput, ListX, RefreshCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { DOWNLOADS_CHANGED, apiFetch, jsonRequest, loadDownloads, loadOrganize } from "@/lib/api-client";
import type {
  DownloadPackageItem,
  DownloadsResponse,
  OrganizeItem,
  OrganizeResponse,
  OrganizeScan,
} from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { usePoll } from "@/hooks/use-poll";
import { AddControls } from "./add-form";
import { queueItems, type QueueChange } from "./queue-controls";
import { PackageRow } from "./package-row";
import { TableFrame } from "@/components/section-frame";
import { isActive, queueLine, sections, sizeOf } from "./logic";
import { MovedRow, OrganizeRow, downloadColumns } from "./organize-row";
import { isMoving, targetOf } from "./organize-logic";
import { ErrorAlert } from "@/components/error-alert";

const loadScan = () => apiFetch<OrganizeScan>("/api/organize/scan");

// A package from when it comes in to when it's in the library, on one
// page: DLC containers and links come in here (a release's mirror on a
// title page too; one the library has nothing of starts right away), are fetched from the hosters one
// file at a time and their archives extracted into DOWNLOAD_DIR
// (lib/downloader.ts); then each goes to the disk picked, into its title's
// folder ("Name (Year) [tmdbid-N]", lib/library-move.ts). Sections in
// logic.ts; Done folds away.
export default function QueuePage() {
  const page = useLoad(loadDownloads);
  const data = page.data;
  // Organize's part, asked for on its own: it reads the library's folders
  // (slow over sshfs), fast only while something moves.
  const organizePage = useLoad(loadOrganize);
  const organize = organizePage.data;
  const [actionError, setError] = useState("");
  const loadError =
    (page.error && `Failed to load downloads: ${page.error}`) ||
    (organizePage.error && `Failed to load the library's disks: ${organizePage.error}`);
  const error = actionError || loadError;

  usePoll(page.reload, data && isActive(data.packages) ? 1000 : 10000);
  usePoll(organizePage.reload, organize && isMoving(organize) ? 1000 : 10000);
  // The sidebar counts what needs a hand.
  useEffect(() => {
    if (data) window.dispatchEvent(new CustomEvent(DOWNLOADS_CHANGED, { detail: data }));
  }, [data]);
  // A download that just finished is Organize's now: asked for again when
  // how many are finished changes, not on every poll.
  const finished = data?.packages.filter((p) => p.status === "done").length;
  const reloadOrganize = organizePage.reload;
  useEffect(() => {
    if (finished !== undefined) reloadOrganize();
  }, [finished, reloadOrganize]);

  async function act(pkgs: DownloadPackageItem[], init: RequestInit, query = "") {
    setError("");
    try {
      for (const pkg of pkgs) await apiFetch(`/api/downloads/${pkg.id}${query}`, init);
    } catch (e) {
      setError((e as Error).message);
    }
    await page.reload();
  }

  const packageRow = (pkg: DownloadPackageItem) => (
    <PackageRow
      key={`p${pkg.id}`}
      pkg={pkg}
      onAction={(action, options) => act([pkg], jsonRequest("POST", { action, ...options }))}
      onRemove={() => act([pkg], { method: "DELETE" })}
    />
  );

  async function changeQueue(change: QueueChange) {
    setError("");
    try {
      page.setData(await apiFetch<DownloadsResponse>("/api/downloads", jsonRequest("PATCH", change)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Moves a package (POST) or clears Done (DELETE); Organize's part comes
  // back. Answers with what went wrong ("" if nothing).
  async function request(init: RequestInit): Promise<string> {
    try {
      organizePage.setData(await apiFetch<OrganizeResponse>("/api/organize", init));
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }
  async function send(init: RequestInit) {
    setError("");
    setError(await request(init));
  }
  // The packages whose move is being asked for: a second click before the
  // (slow) answer does nothing rather than ask again.
  const sending = useRef(new Set<number>());
  async function post(id: number, target: string, replace?: boolean): Promise<string> {
    if (sending.current.has(id)) return "";
    sending.current.add(id);
    try {
      return await request(jsonRequest("POST", { id, target, replace }));
    } finally {
      sending.current.delete(id);
    }
  }
  async function move(id: number, target: string, replace?: boolean) {
    setError("");
    setError(await post(id, target, replace));
  }
  const clear = () => send({ method: "DELETE" });
  // A finished download off the list, its files too.
  async function remove(id: number) {
    setError("");
    try {
      await apiFetch(`/api/downloads/${id}?files=delete`, { method: "DELETE" });
      page.reload();
      organizePage.reload();
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
  // Move all: each one ready that can be moved, to its disk, one after
  // another; not what the library has already (Replace, one by one, even
  // when it was started with Replace: what's moved is always a hand's).
  const movable = (item: OrganizeItem) => !item.error && !item.owned.length && targetOf(item, picked[item.id]);
  const fresh = organize?.items.filter((i) => !i.move) ?? [];
  // Off while it goes through them; what failed is said once it's through.
  const [movingAll, setMovingAll] = useState(false);
  async function moveAll(items: OrganizeItem[]) {
    setError("");
    setMovingAll(true);
    const errors: string[] = [];
    for (const item of items) {
      const target = movable(item);
      const error = target ? await post(item.id, target.path) : "";
      if (error) errors.push(`${item.name}: ${error}`);
    }
    setMovingAll(false);
    setError(errors.join(" · "));
  }

  const parts = data ? sections(data.packages, organize ?? null) : [];
  // Done open on load only when it's all there is; a click decides then.
  const [doneToggled, setDoneOpen] = useState<boolean | null>(null);
  const doneOpen = doneToggled ?? parts.length === 1;

  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      {/* The page's ⋯ at the right of the heading: adding packages (pasted
          links open below it), Download all, Pause all and Resume all
          (how many come in at once is on Settings); Rescan library (the
          library scan, and Jellyfin's, lib/rescan.ts; it runs on its own
          after moves too), Move all and Clear finished. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold max-md:sr-only">Queue</h1>
        <AddControls
          more={
            data
              ? [
                  // Not what the library has some of: that waits for Replace or Skip.
                  data.packages.some((p) => p.status === "pending" && !p.library)
                    ? [
                        {
                          icon: CircleArrowDown,
                          label: "Download all",
                          onClick: () =>
                            act(
                              data.packages.filter((p) => p.status === "pending" && !p.library),
                              jsonRequest("POST", { action: "start" }),
                            ),
                        },
                      ]
                    : [],
                  queueItems(data, changeQueue),
                  [
                    {
                      icon: RefreshCcw,
                      label: scanning ? "Scanning" : "Rescan library",
                      onClick: scan,
                      disabled: scanning,
                    },
                    ...(fresh.length
                      ? [
                          {
                            icon: FolderInput,
                            label: "Move all",
                            onClick: () => moveAll(fresh),
                            disabled: movingAll || !fresh.some(movable),
                          },
                        ]
                      : []),
                    ...(organize?.moved.some((m) => !m.move)
                      ? [{ icon: ListX, label: "Clear finished", onClick: clear }]
                      : []),
                  ],
                ]
              : []
          }
          onAdded={page.setData}
          onError={setError}
        />
      </div>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      {data && !data.ready ? (
        <Alert className="mt-6">
          <AlertCircle />
          <AlertDescription>
            Set DDOWNLOAD_LOGIN and DDOWNLOAD_PASSWORD (a premium account on ddownload.com) or REALDEBRID_TOKEN to fetch
            links.
          </AlertDescription>
        </Alert>
      ) : null}
      {organize && !organize.ready ? (
        <Alert className="mt-6">
          <AlertCircle />
          <AlertDescription>
            {organize.libraryDir
              ? `No disks in ${organize.libraryDir}.`
              : "Set LIBRARY_DIR to the library's disks (each with movies/ and shows/)."}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* One muted line, the numbers bright: on a phone as on a desktop. */}
      <div className="mt-6 text-sm text-muted-foreground">
        {data ? (
          queueLine(data).map((st, i) => (
            <Fragment key={i}>
              {i ? " · " : null}
              <span className="font-num text-foreground tabular-nums">{st.value}</span>
              {st.word ? ` ${st.word}` : null}
            </Fragment>
          ))
        ) : (
          <Skeleton className="h-5 w-72 max-w-full" />
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {!data ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : parts.length === 0 ? (
          <EmptyState icon={FileDown} title="Drop DLC files anywhere on this page" />
        ) : (
          parts.map((part) => (
            // A table each, headed with the section and its count, like a
            // title page's releases; what acts on all of it in the page's ⋯.
            <TableFrame
              key={part.title}
              title={part.title}
              count={sizeOf(part)}
              columns={downloadColumns}
              {...(part.title === "Done" ? { open: doneOpen, onToggle: () => setDoneOpen(!doneOpen) } : {})}
            >
              {part.packages.map(packageRow)}
              {part.items.map((item) => (
                <OrganizeRow
                  key={`i${item.id}`}
                  item={item}
                  picked={picked[item.id]}
                  onPick={(target) => setPicked((p) => ({ ...p, [item.id]: target }))}
                  onMove={(target, replace) => move(item.id, target, replace)}
                  onDelete={() => remove(item.id)}
                />
              ))}
              {part.moved.map((item) => (
                <MovedRow
                  key={`m${item.id}`}
                  item={item}
                  onUndo={() => send(jsonRequest("POST", { id: item.id, undo: true }))}
                />
              ))}
              {part.pending.map(packageRow)}
            </TableFrame>
          ))
        )}
      </div>
    </main>
  );
}
