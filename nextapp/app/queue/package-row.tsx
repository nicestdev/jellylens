"use client";

import { CircleArrowDown, Pause, Play, RefreshCcw, RotateCcw, Trash2, X, type LucideIcon } from "lucide-react";
import type { DownloadPackageItem, LibraryChoice } from "@/lib/api-types";
import { ConfirmItem } from "@/components/confirm-item";
import { LibraryIcon } from "@/components/library-icon";
import { CELL, MENU_CELL, NOT_ON_PHONE, NUMBER_CELL, ROW } from "@/components/library-table";
import { PhoneStatus, StatusCell, type RowState } from "@/components/row-status";
import { formatBytes } from "@/lib/format";
import { ActionItem, ActionMenu, FileTree, TitleCell } from "./organize-row";
import { cn } from "@/lib/utils";
import { errorLine, formatSpeed, partCheck, releaseName, STATUS_LABEL, summarize, timeLeft } from "./logic";

// Color only on the bar: peach while it waits, green while it comes in,
// sky while it's extracted, muted while paused.
const BAR: Partial<Record<DownloadPackageItem["status"], string>> = {
  queued: "bg-warning",
  downloading: "bg-success",
  extracting: "bg-info",
  paused: "bg-muted-foreground/50",
};

// What a click on each state does (nothing while extracting).
type MainAction = { action: PackageAction; icon: LucideIcon; label: string };
const MAIN_ACTION: Partial<Record<DownloadPackageItem["status"], MainAction>> = {
  pending: { action: "start", icon: Play, label: "Start" },
  queued: { action: "pause", icon: Pause, label: "Pause" },
  downloading: { action: "pause", icon: Pause, label: "Pause" },
  paused: { action: "resume", icon: Play, label: "Resume" },
  failed: { action: "retry", icon: RotateCcw, label: "Retry" },
};

// Where a package is at (components/row-status.tsx): a new one's parts
// (partCheck: Checking, then how many are online, red when one is offline
// or missing); while it moves a bar over the state and speed and
// time left while it comes in (how much is here if it's stalled); waiting,
// paused or extracting the state alone, the bar is the rest; a failed
// one's error (red). A finished
// one is an OrganizeRow.
function stateOf(pkg: DownloadPackageItem): RowState {
  if (pkg.status === "pending") {
    const check = partCheck(pkg);
    const lib = pkg.library;
    // What the library has, like a Ready to organize row's diffstat, unless the parts'
    // check says something's off (red, or peach: no answer for one).
    if (!lib || check.tone) return check;
    if (!lib.new.length) return { line: "All in library" };
    return {
      line: (
        // Like the tree's marks: − what goes, = what's skipped (blue), + what comes.
        <span>
          {lib.exact ? (
            <span className="text-info">={lib.skip} </span>
          ) : (
            <span className="text-destructive">−{lib.old.length} </span>
          )}
          <span className="text-success">+{lib.new.length}</span>
        </span>
      ),
    };
  }
  if (pkg.status === "failed") return { line: errorLine(pkg.error), tone: "error" };
  const s = summarize(pkg);
  const left = s.estimate ? timeLeft(s.estimate - s.received, s.speed) : null;
  // Waiting, paused or extracting: the state alone, the bar's share and the
  // Size column say how far.
  const detail =
    pkg.status !== "downloading"
      ? null
      : s.speed
        ? [formatSpeed(s.speed), left]
        : s.total
          ? [`${formatBytes(s.received)} of ${formatBytes(s.total)}`]
          : [formatBytes(s.received)];
  return {
    line: [STATUS_LABEL[pkg.status], ...(detail ?? [])],
    bar: { fraction: s.fraction, color: BAR[pkg.status] ?? "" },
  };
}

// The ⋯ at the end of a row: first what its state calls for (Start a new
// one, or for one the library has some of Download or Download missing;
// Pause one loading or waiting, Resume a paused one, Retry a failed one);
// then Reset (back among the new ones in Needs attention; not for a new one), and Remove (a
// new one: off the list, nothing's downloaded yet; grey, a cross) or Delete
// (what's downloaded goes too; red, a bin). Reset, Remove and Delete take
// a second click.
function RowMenu({
  pkg,
  onAction,
  onRemove,
}: {
  pkg: DownloadPackageItem;
  onAction: (action: PackageAction, options?: { choice: LibraryChoice }) => void;
  onRemove: () => void;
}) {
  const main = MAIN_ACTION[pkg.status];
  const lib = pkg.status === "pending" ? pkg.library : null;
  return (
    <ActionMenu name={pkg.name}>
      {lib ? (
        // What the library has decides: another version all of it (the
        // Replace comes in Ready to organize), this one only what's missing,
        // or nothing (only Remove).
        lib.choices.map((choice) => (
          <ActionItem
            key={choice}
            icon={CircleArrowDown}
            label={choice === "replace" ? "Download" : "Download missing"}
            onClick={() => onAction("start", { choice })}
          />
        ))
      ) : main ? (
        <ActionItem icon={main.icon} label={main.label} onClick={() => onAction(main.action)} />
      ) : null}
      {pkg.status === "pending" ? (
        <ConfirmItem icon={X} label="Remove" plain onConfirm={onRemove} />
      ) : (
        <>
          <ConfirmItem icon={RefreshCcw} label="Reset" plain onConfirm={() => onAction("reset")} />
          <ConfirmItem icon={Trash2} label="Delete" onConfirm={onRemove} />
        </>
      )}
    </ActionMenu>
  );
}

// One package as a table row, two lines where it helps (like Analytics'
// files): title, a peach icon when the library has some of it,
// the release name under it (and then the library's tree); where it's at (stateOf); its size; and the ⋯
// menu, which starts, pauses, resumes or retries it.
type PackageAction = "start" | "pause" | "resume" | "reset" | "retry";
export function PackageRow({
  pkg,
  onAction,
  onRemove,
}: {
  pkg: DownloadPackageItem;
  onAction: (action: PackageAction, options?: { choice: LibraryChoice }) => void;
  onRemove: () => void;
}) {
  const s = summarize(pkg);
  const state = stateOf(pkg);
  // A new one the library has some of: where it is and what comes, as a
  // tree like a Ready to organize row's (the old files' folder; − what a Replace takes
  // out, + what comes), the disks in the Disk column.
  const lib = pkg.status === "pending" ? pkg.library : null;
  const at = lib?.old[0]?.split("/");
  // The old files' paths in the title's folder (a show's in Season NN/).
  const inFolder = lib?.old.map((p) => p.split("/").slice(3).join("/")) ?? [];
  const onDisk = lib?.disks.length ? lib.disks.join(", ") : null;
  const menu = <RowMenu pkg={pkg} onAction={onAction} onRemove={onRemove} />;
  const size = s.total ? formatBytes(s.total) : "—";

  return (
    <tr className={cn(ROW, "h-17")}>
      <TitleCell
        media={pkg.media}
        name={pkg.name}
        icon={lib ? <LibraryIcon className="self-center" /> : null}
        line={releaseName(pkg.name)}
        mono
        below={
          <>
            {lib && at ? (
              <div className="mt-1 text-muted-foreground">
                <FileTree
                  root={`${at[0]}/${at[1]}`}
                  folder={at[2]}
                  old={lib.exact ? [] : inFolder}
                  kept={lib.exact ? inFolder : []}
                  files={lib.new}
                />
              </div>
            ) : null}
            {/* On a phone the Status and Size columns are gone: where it's at
                comes here, with the size when there's no bar. */}
            <PhoneStatus state={state} right={state.bar ? undefined : size} />
          </>
        }
        menu={menu}
      />
      {/* The Disk column is Ready to organize's; on a new one the disk the
          library has it on, peach like the icon after the title (where a
          Replace would go), else empty while it comes in. */}
      <td className={cn(CELL, NOT_ON_PHONE)}>
        {onDisk ? <span className="block truncate font-medium text-warning">{onDisk}</span> : null}
      </td>
      <StatusCell state={state} />
      <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{size}</td>
      <td className={MENU_CELL}>{menu}</td>
    </tr>
  );
}
