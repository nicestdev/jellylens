"use client";

import { MoreHorizontal, Pause, Play, RefreshCcw, RotateCcw, SkipForward, Trash2, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DownloadPackageItem } from "@/lib/api-types";
import { ConfirmItem } from "@/components/confirm-item";
import { InLibraryIcon } from "@/components/in-library-icon";
import { MENU_CELL, NOT_ON_PHONE, NUMBER_CELL, PHONE_MENU, ROW, type Column } from "@/components/library-table";
import { PhoneStatus, StatusCell, type RowState } from "@/components/row-status";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  displayName,
  errorLine,
  formatSpeed,
  libraryBadge,
  partCheck,
  releaseName,
  statusLabel,
  summarize,
  timeLeft,
} from "./logic";

// Color only on the bar: peach while it waits, green while it comes in,
// sky while it's extracted, muted while paused.
const BAR: Partial<Record<DownloadPackageItem["status"], string>> = {
  queued: "bg-warning",
  downloading: "bg-success",
  extracting: "bg-info",
  paused: "bg-muted-foreground/50",
};

const iconButton = cn(buttonVariants({ variant: "ghost", size: "icon-sm", className: "text-muted-foreground" }));

// What a click on each state does (nothing while extracting or done).
type MainAction = { action: PackageAction; icon: LucideIcon; label: string };
const MAIN_ACTION: Partial<Record<DownloadPackageItem["status"], MainAction>> = {
  pending: { action: "start", icon: Play, label: "Start" },
  queued: { action: "pause", icon: Pause, label: "Pause" },
  downloading: { action: "pause", icon: Pause, label: "Pause" },
  paused: { action: "resume", icon: Play, label: "Resume" },
  failed: { action: "retry", icon: RotateCcw, label: "Retry" },
};

type MissingOnly = { missing: number; all: number } | null;

// Where a package is at (components/row-status.tsx): a new one's parts
// (partCheck: Checking, then how many are online, red when one is offline
// or missing); while it moves a bar over the state and speed and
// time left while it comes in, else how much is here (nothing more while
// it's extracted, the bar is that); a failed one's error (red); "—" for a
// finished one.
function stateOf(pkg: DownloadPackageItem): RowState {
  if (pkg.status === "pending") {
    const check = partCheck(pkg);
    return check;
  }
  if (pkg.status === "failed") return { line: errorLine(pkg.error), hint: pkg.error ?? undefined, tone: "error" };
  if (pkg.status === "done") return { line: "—" };
  const s = summarize(pkg);
  const left = s.estimate ? timeLeft(s.estimate - s.received, s.speed) : null;
  const detail =
    pkg.status === "extracting"
      ? null
      : pkg.status === "downloading" && s.speed
        ? [formatSpeed(s.speed), left].filter(Boolean).join(" · ")
        : s.total
          ? `${formatBytes(s.received)} of ${formatBytes(s.total)}`
          : formatBytes(s.received);
  return {
    line: [statusLabel(pkg), detail].filter(Boolean).join(" · "),
    bar: { fraction: s.fraction, color: BAR[pkg.status] ?? "" },
  };
}

// The ⋯ at the end of a row: first what its state calls for (Start a new
// one, or with episodes the library has only the missing ones or all;
// Pause one loading or waiting, Resume a paused one, Retry a failed one);
// then Reset (back to New; not for a new or finished one), and Remove (a
// new one) or Delete (what's downloaded, a finished one's files and all).
// Reset, Remove and Delete take a second click.
function RowMenu({
  pkg,
  missingOnly,
  onAction,
  onRemove,
}: {
  pkg: DownloadPackageItem;
  missingOnly: MissingOnly;
  onAction: (action: PackageAction, options?: { only: "missing" }) => void;
  onRemove: () => void;
}) {
  const main = MAIN_ACTION[pkg.status];
  const MainIcon = main?.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`More for ${pkg.name}`} title="More" className={iconButton}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto max-w-[min(32rem,90vw)]">
        {main && MainIcon ? (
          <>
            {pkg.status === "pending" && missingOnly ? (
              <>
                <DropdownMenuItem onClick={() => onAction("start", { only: "missing" })}>
                  <SkipForward />
                  Start only the {missingOnly.missing} missing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction("start")}>
                  <Play />
                  Start all {missingOnly.all}
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onClick={() => onAction(main.action)}>
                <MainIcon />
                {main.label}
              </DropdownMenuItem>
            )}
          </>
        ) : null}
        {pkg.status !== "pending" && pkg.status !== "done" ? (
          <ConfirmItem icon={RefreshCcw} label="Reset" plain onConfirm={() => onAction("reset")} />
        ) : null}
        <ConfirmItem icon={Trash2} label={pkg.status === "pending" ? "Remove" : "Delete"} onConfirm={onRemove} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The columns of a group's table, PackageRow's cells in order; fixed
// widths so New, Running and Finished line up. Each fits its widest value
// plus padding: a bar with "Loading · 999.99 KB/s · 12 h 59 min" and
// "100%" under it; "999.99 GB".
export const PACKAGE_COLUMNS: Column[] = [
  { label: "Title" },
  { label: "Status", width: "w-64", phone: false },
  { label: "Size", align: "right", width: "w-24", phone: false },
  { label: "Actions", hidden: true, width: "w-14", phone: false },
];

// One package as a table row, two lines where it helps (like Analytics'
// files): a peach icon when the library has some of it, title and year,
// the release name under it; where it's at (stateOf); its size; and the ⋯
// menu, which starts, pauses, resumes or retries it.
type PackageAction = "start" | "pause" | "resume" | "reset" | "retry";
export function PackageRow({
  pkg,
  onAction,
  onRemove,
}: {
  pkg: DownloadPackageItem;
  onAction: (action: PackageAction, options?: { only: "missing" }) => void;
  onRemove: () => void;
}) {
  const s = summarize(pkg);
  const state = stateOf(pkg);
  const { title, year } = displayName(pkg);
  const library = libraryBadge(pkg);
  // Some episodes already in the library: Start asks whether to skip them.
  const lib = pkg.library;
  const missingOnly: MissingOnly =
    lib && lib.parts && lib.partsOwned > 0 && lib.partsOwned < lib.parts
      ? { missing: pkg.files.filter((f) => !f.inLibrary).length, all: pkg.files.length }
      : null;
  const doneSize = pkg.outputs.reduce((n, o) => n + o.size, 0);
  const menu = <RowMenu pkg={pkg} missingOnly={missingOnly} onAction={onAction} onRemove={onRemove} />;
  const size = pkg.status === "done" ? (doneSize ? formatBytes(doneSize) : "—") : s.total ? formatBytes(s.total) : "—";

  return (
    <tr className={ROW}>
      <td className="w-full max-w-0 px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5" title={`${pkg.name}\n${pkg.dir}`}>
            <span className="truncate font-medium">{title}</span>
            {year ? <span className="shrink-0 font-num text-xs text-muted-foreground">{year}</span> : null}
            {/* After the name: you may have it already (always peach here, to
                stand out before you start it; the tooltip says which). */}
            {library ? <InLibraryIcon {...library} exact /> : null}
          </span>
          <span className={PHONE_MENU}>{menu}</span>
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground" title={pkg.name}>
          {releaseName(pkg.name)}
        </div>
        {/* On a phone the Status and Size columns are gone: where it's at
            comes here, with the size when there's no bar; nothing for a
            finished one, its section says it all. */}
        <PhoneStatus
          state={state}
          right={state.bar ? undefined : size}
          className={cn(pkg.status === "done" && "hidden")}
        />
      </td>
      <StatusCell state={state} />
      <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{size}</td>
      <td className={MENU_CELL}>{menu}</td>
    </tr>
  );
}
