"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CircleArrowDown, FolderInput, ListX, Replace, Rocket, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { DOWNLOADS_CHANGED, apiFetch, jsonRequest, loadDownloads, loadOrganize } from "@/lib/api-client";
import type { DownloadPackageItem, DownloadsResponse, OrganizeResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { usePoll } from "@/hooks/use-poll";
import { AddControls } from "./add-form";
import { queueItems, type QueueChange } from "./queue-controls";
import { PackageRow } from "./package-row";
import { TableFrame } from "@/components/section-frame";
import { StatStrip } from "@/components/stat-strip";
import { isActive, queueLine, sections, sizeOf, startable } from "./logic";
import { MovedRow, OrganizeRow, downloadColumns } from "./organize-row";
import { isMoving, replaceable } from "./organize-logic";
import { ErrorAlert } from "@/components/error-alert";

// A package from when it comes in to when it's in the library, on one
// page: DLC containers and links come in here (a release's mirror on a
// title page too; one the library has nothing of starts right away), are fetched from the hosters one
// file at a time and their archives extracted into DOWNLOAD_DIR
// (lib/downloader.ts); then each goes to the disk picked, into its title's
// folder ("Name (Year) [tmdbid-N]", lib/library-move.ts). Sections in
// logic.ts; Done folds away.
const STATS = {
  Speed: "all downloads together",
  Left: "still to download",
  "Time left": "at this speed",
  Free: "in the downloads folder",
} as const;

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
  // The disk picked per item (its path).
  const [picked, setPicked] = useState<Record<number, string>>({});

  const parts = data ? sections(data.packages, organize ?? null) : [];
  // Replace all: one after another, as a click each would; the first error
  // is shown.
  const toReplace = replaceable(organize?.items ?? [], picked);
  // Download all: each as its own ⋯ would start it; the first error is shown.
  const toStart = data ? startable(data.packages) : [];
  async function startAll() {
    setError("");
    try {
      for (const { pkg, choice } of toStart)
        await apiFetch(
          `/api/downloads/${pkg.id}`,
          jsonRequest("POST", { action: "start", ...(choice ? { choice } : {}) }),
        );
    } catch (e) {
      setError((e as Error).message);
    }
    await page.reload();
  }
  async function replaceAll() {
    setError("");
    let first = "";
    for (const { item, target } of toReplace) first ||= await post(item.id, target.path, true);
    setError(first);
  }
  // Move all: the same for what's new to the library, to its disk.
  const toMove = replaceable(organize?.items ?? [], picked, false);
  async function moveAll() {
    setError("");
    let first = "";
    for (const { item, target } of toMove) first ||= await post(item.id, target.path);
    setError(first);
  }
  // Clear Needs attention: everything in it off the list, with what's
  // downloaded (a failed or new package, a finished one that can't be moved
  // or whose move failed).
  const attention = parts.find((p) => p.title === "Needs attention");
  async function clearAttention() {
    if (!attention) return;
    setError("");
    try {
      for (const pkg of [...attention.packages, ...attention.pending])
        await apiFetch(`/api/downloads/${pkg.id}`, { method: "DELETE" });
      for (const item of attention.items)
        await apiFetch(`/api/downloads/${item.id}?files=delete`, { method: "DELETE" });
    } catch (e) {
      setError((e as Error).message);
    }
    page.reload();
    organizePage.reload();
  }
  const stats = data ? queueLine(data) : [];
  // Each section folds away under its heading on a click; open from the
  // start but Done, which is only when it's all there is.
  const [toggled, setToggled] = useState<Partial<Record<string, boolean>>>({});
  const isOpen = (title: string) => toggled[title] ?? (title !== "Done" || parts.length === 1);

  return (
    <main className="w-full max-w-[90rem] px-4 py-4 sm:px-6 sm:py-5">
      {/* The page's ⋯ at the right of the heading: adding packages (pasted
          links open below it), Download all, Replace all, Pause all and
          Resume all (how many come in at once is on Settings), Clear needs
          attention and Clear done. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold max-md:sr-only">Queue</h1>
        <AddControls
          more={
            data
              ? [
                  toStart.length ? [{ icon: CircleArrowDown, label: "Download all", onClick: startAll }] : [],
                  [
                    ...(toMove.length ? [{ icon: FolderInput, label: "Move all", onClick: moveAll }] : []),
                    ...(toReplace.length
                      ? [{ icon: Replace, label: "Replace all", onClick: replaceAll, confirm: true }]
                      : []),
                  ],
                  queueItems(data, changeQueue),
                  [
                    ...(attention
                      ? [{ icon: Trash2, label: "Clear needs attention", onClick: clearAttention, confirm: true }]
                      : []),
                    ...(organize?.moved.length ? [{ icon: ListX, label: "Clear done", onClick: clear }] : []),
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
        <Alert className="mt-4 sm:mt-6">
          <AlertCircle />
          <AlertDescription>
            Set DDOWNLOAD_LOGIN and DDOWNLOAD_PASSWORD (a premium account on ddownload.com) or REALDEBRID_TOKEN to fetch
            links.
          </AlertDescription>
        </Alert>
      ) : null}
      {organize && !organize.ready ? (
        <Alert className="mt-4 sm:mt-6">
          <AlertCircle />
          <AlertDescription>
            {organize.libraryDir
              ? `No disks in ${organize.libraryDir}.`
              : "Set LIBRARY_DIR to the library's disks (each with movies/ and shows/)."}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* The stats in one strip: Speed, Left and Time left only while something comes in
          (queueLine has them then), Free always. */}
      <div className="mt-4 sm:mt-6">
        <StatStrip
          loading={!data}
          stats={(Object.keys(STATS) as (keyof typeof STATS)[]).flatMap((label) => {
            const value = stats.find((st) => st.label === label)?.value;
            if (!value && label !== "Free") return [];
            return [{ label, value: value ?? "—", hint: STATS[label], muted: !value }];
          })}
        />
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:mt-6 sm:gap-6">
        {!data ? (
          <div className="flex flex-col gap-4 sm:gap-6">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : parts.length === 0 ? (
          <EmptyState icon={Rocket} title="Your queue is empty" hint="Drop DLC files anywhere on this page." />
        ) : (
          parts.map((part) => (
            // A table each, headed with the section and its count, like a
            // title page's releases; what acts on all of it in the page's ⋯.
            <TableFrame
              key={part.title}
              title={part.title}
              count={sizeOf(part)}
              columns={downloadColumns}
              open={isOpen(part.title)}
              onToggle={() => setToggled((t) => ({ ...t, [part.title]: !isOpen(part.title) }))}
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
                <MovedRow key={`m${item.id}`} item={item} />
              ))}
              {part.pending.map(packageRow)}
            </TableFrame>
          ))
        )}
      </div>
    </main>
  );
}
