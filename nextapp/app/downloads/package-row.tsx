"use client";

import { useEffect, useState } from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  CircleArrowDown,
  Clock,
  Library,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  SkipForward,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DownloadPackageItem } from "@/lib/api-types";
import { CELL, MUTED_CELL, NOT_ON_PHONE, NUMBER_CELL, ROW, type Column } from "@/components/library-table";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  displayName,
  errorLine,
  formatSpeed,
  libraryBadge,
  partProblem,
  releaseName,
  statusLabel,
  summarize,
  timeLeft,
} from "./logic";

// Color only where it matters: green while it works (downloading,
// extracting), peach once started but not running (paused, waiting), red
// when it failed; new and done ones plain or muted.
const LOOK: Record<DownloadPackageItem["status"], { icon: LucideIcon; tile: string; bar: string }> = {
  pending: { icon: Play, tile: "text-foreground", bar: "" },
  paused: { icon: Pause, tile: "text-warning", bar: "bg-warning" },
  queued: { icon: Clock, tile: "text-warning", bar: "bg-warning" },
  downloading: { icon: CircleArrowDown, tile: "text-success", bar: "bg-success" },
  extracting: { icon: Archive, tile: "text-success", bar: "bg-success" },
  done: { icon: CheckCircle2, tile: "text-muted-foreground", bar: "bg-muted-foreground/50" },
  failed: { icon: AlertCircle, tile: "text-destructive", bar: "bg-destructive" },
};

// A progress bar: a muted track filled to fraction.
function Bar({ fraction, color, className }: { fraction: number; color: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700", color)}
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}

const iconButton = cn(buttonVariants({ variant: "ghost", size: "icon-sm", className: "text-muted-foreground" }));
const fileUrl = (pkg: DownloadPackageItem, path: string) =>
  `/api/downloads/${pkg.id}/file?path=${encodeURIComponent(path)}`;

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

// The state, which is also its main action: Ready starts it, Loading
// or Waiting pauses, Paused resumes, Failed retries; pointed at, it shows
// that action in mauve instead. Ready with episodes the library has asks
// whether to start only the missing ones.
function StatusButton({
  pkg,
  missingOnly,
  onAction,
  className,
}: {
  pkg: DownloadPackageItem;
  missingOnly: MissingOnly;
  onAction: (action: PackageAction, options?: { only: "missing" }) => void;
  className?: string;
}) {
  const look = LOOK[pkg.status];
  const Icon = look.icon;
  const state = (
    <span className={cn("inline-flex items-center gap-1.5", look.tile)}>
      <Icon className="size-3.5 shrink-0" />
      {statusLabel(pkg)}
    </span>
  );
  const main = MAIN_ACTION[pkg.status];
  if (!main) return <span className={className}>{state}</span>;
  const Action = main.icon;
  // Both faces in one grid cell, the hidden one invisible: the button is as
  // wide as the wider, so pointing at it doesn't change its width (and
  // flicker when that moves its edge out from under the pointer).
  const face = (
    <span className="grid">
      <span className="col-start-1 row-start-1 group-hover/status:invisible group-focus-visible/status:invisible">
        {state}
      </span>
      <span className="invisible col-start-1 row-start-1 inline-flex items-center gap-1.5 text-primary group-hover/status:visible group-focus-visible/status:visible">
        <Action className="size-3.5 shrink-0" />
        {main.label}
      </span>
    </span>
  );
  const button = cn("group/status inline-flex shrink-0 cursor-pointer items-center text-left outline-none", className);
  if (pkg.status === "pending" && missingOnly)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Start" title="Start" className={button}>
          {face}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto">
          <DropdownMenuItem onClick={() => onAction("start", { only: "missing" })}>
            <SkipForward />
            Start only the {missingOnly.missing} missing
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction("start")}>
            <Play />
            Start all {missingOnly.all}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  return (
    <button
      type="button"
      onClick={() => onAction(main.action)}
      aria-label={main.label}
      title={main.label}
      className={button}
    >
      {face}
    </button>
  );
}

// A menu item whose action can't be undone: the first click arms it
// ("Sure? Click again", the menu stays open) for ARM_MS, the second
// does it. Red, or peach for Reset (it goes back to New, peach too).
const ARM_MS = 3000;

function ConfirmItem({
  icon: Icon,
  label,
  warning,
  onConfirm,
}: {
  icon: LucideIcon;
  label: string;
  warning?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <DropdownMenuItem
      variant={warning ? "default" : "destructive"}
      closeOnClick={armed}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={cn(
        warning && "text-warning focus:bg-warning/10 focus:text-warning focus:**:text-warning",
        armed && (warning ? "bg-warning/15" : "bg-destructive/15"),
      )}
    >
      <Icon />
      {armed ? "Sure? Click again" : label}
    </DropdownMenuItem>
  );
}

// The ⋯ at the end of a row: a finished package's Download (one per file
// if it has several, the name as tooltip) and Delete (files and all); any
// other's Reset (back to New; not for a new one) and Remove (a new one)
// or Delete (and what's downloaded). Reset, Remove and Delete take a
// second click.
function RowMenu({
  pkg,
  onAction,
  onRemove,
}: {
  pkg: DownloadPackageItem;
  onAction: (action: PackageAction) => void;
  onRemove: () => void;
}) {
  const outputs = pkg.outputs;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`More for ${pkg.name}`} title="More" className={iconButton}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto max-w-[min(32rem,90vw)]">
        {pkg.status === "done" ? (
          <>
            {outputs.map((o, i) => (
              <MenuPrimitive.LinkItem
                key={o.path}
                closeOnClick
                render={<a href={fileUrl(pkg, o.path)} download title={o.path} />}
                className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
              >
                <CircleArrowDown className="size-4 shrink-0" />
                {outputs.length > 1 ? `Download ${i + 1}` : "Download"}
              </MenuPrimitive.LinkItem>
            ))}
            {outputs.length ? <DropdownMenuSeparator /> : null}
            <ConfirmItem icon={Trash2} label="Delete" onConfirm={onRemove} />
          </>
        ) : (
          <>
            {pkg.status !== "pending" ? (
              <ConfirmItem icon={RefreshCcw} label="Reset" warning onConfirm={() => onAction("reset")} />
            ) : null}
            <ConfirmItem icon={Trash2} label={pkg.status === "pending" ? "Remove" : "Delete"} onConfirm={onRemove} />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// A Progress cell: the bar, and under it a line (speed, how much is
// here) with the share done on the right.
function ProgressCell({ fraction, color, line }: { fraction: number; color: string; line?: string | null }) {
  const pct = `${Math.floor(fraction * 100)}%`;
  return (
    <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>
      <Bar fraction={fraction} color={color} className="mt-1 h-1" />
      <span className="mt-1.5 flex items-baseline gap-2 text-[11px] tabular-nums">
        <span className="min-w-0 flex-1 truncate">{line}</span>
        <span className="font-num">{pct}</span>
      </span>
    </td>
  );
}

// The columns of a group's table, PackageRow's cells in order; fixed
// widths so New, Running and Finished line up. Each fits its widest value
// in Geist at 13px plus padding: "Extracting" with its icon; a bar with
// "100%" over "999,99 KB/s · 123 h 59 min"; "999,99 GB".
export const PACKAGE_COLUMNS: Column[] = [
  { label: "Title" },
  { label: "Status", width: "w-28", phone: false },
  { label: "Progress", width: "w-52", phone: false },
  { label: "Size", align: "right", width: "w-24", phone: false },
  { label: "Actions", hidden: true, width: "w-14" },
];

// One package as a table row, two lines where it helps (like Analytics'
// files): a peach icon when the library has some of it, title and year,
// the release name under it; its state; while it moves a bar with the
// share done over speed and time left (or how much is here), a failed
// one's error instead (its failed files' names and errors); its size; and
// the ⋯ menu. A click on the state starts, pauses, resumes or retries it.
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
  const look = LOOK[pkg.status];
  const { title, year } = displayName(pkg);
  const library = libraryBadge(pkg);
  const problem = partProblem(pkg);
  // Some episodes already in the library: Start asks whether to skip them.
  const lib = pkg.library;
  const missingOnly: MissingOnly =
    lib && lib.parts && lib.partsOwned > 0 && lib.partsOwned < lib.parts
      ? { missing: pkg.files.filter((f) => !f.inLibrary).length, all: pkg.files.length }
      : null;
  const moving = pkg.status !== "done" && pkg.status !== "pending" && pkg.status !== "failed";
  const left = moving && s.estimate ? timeLeft(s.estimate - s.received, s.speed) : null;
  // Under the bar: speed and time left while it comes in, else how much
  // is here so far; nothing while it's extracted (the bar is that).
  const progressLine =
    pkg.status === "extracting"
      ? null
      : pkg.status === "downloading" && s.speed
        ? [formatSpeed(s.speed), left].filter(Boolean).join(" · ")
        : s.total
          ? `${formatBytes(s.received)} of ${formatBytes(s.total)}`
          : formatBytes(s.received);
  const doneSize = pkg.outputs.reduce((n, o) => n + o.size, 0);
  const size = pkg.status === "done" ? (doneSize ? formatBytes(doneSize) : "—") : s.total ? formatBytes(s.total) : "—";

  return (
    <tr className={ROW}>
      <td className="w-full max-w-0 px-3 py-2">
        <span className="flex min-w-0 items-baseline gap-1.5" title={`${pkg.name}\n${pkg.dir}`}>
          <span className="truncate font-medium">{title}</span>
          {year ? <span className="shrink-0 font-num text-xs text-muted-foreground">{year}</span> : null}
          {/* After the name, in the warning color: you may have it already. */}
          {library ? (
            <span
              title={[library.label, library.hint].filter(Boolean).join("\n")}
              className="shrink-0 self-center text-warning"
            >
              <Library className="size-3.5" aria-label={library.label} />
            </span>
          ) : null}
        </span>
        <div className="truncate font-mono text-[11px] text-muted-foreground" title={pkg.name}>
          {releaseName(pkg.name)}
        </div>
        {/* On a phone the Status, Progress and Size columns are gone: their
              state, how far it is (or its error) and its size come here;
              nothing for a finished one, its section says it all. */}
        <div className={cn("sm:hidden", pkg.status === "done" && "hidden")}>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
            <StatusButton pkg={pkg} missingOnly={missingOnly} onAction={onAction} />
            <span
              className="min-w-0 flex-1 truncate text-muted-foreground"
              title={pkg.error ?? problem?.detail ?? undefined}
            >
              {pkg.status === "failed" ? (
                <span className="text-destructive">{errorLine(pkg.error)}</span>
              ) : problem ? (
                <span className="text-destructive">{problem.line}</span>
              ) : moving && progressLine ? (
                progressLine
              ) : null}
            </span>
            <span className="shrink-0 font-num text-[11px] text-muted-foreground tabular-nums">
              {moving ? `${Math.floor(s.fraction * 100)}%` : size}
            </span>
          </span>
          {moving ? <Bar fraction={s.fraction} color={look.bar} className="mt-1.5 h-1" /> : null}
        </div>
      </td>
      <td className={cn(CELL, NOT_ON_PHONE)}>
        <StatusButton pkg={pkg} missingOnly={missingOnly} onAction={onAction} className="align-top" />
      </td>
      {moving ? (
        <ProgressCell fraction={s.fraction} color={look.bar} line={progressLine} />
      ) : (
        <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>
          {pkg.status === "failed" ? (
            <span title={pkg.error ?? undefined} className="block truncate text-destructive">
              {errorLine(pkg.error)}
            </span>
          ) : problem ? (
            <span title={problem.detail} className="block truncate text-destructive">
              {problem.line}
            </span>
          ) : (
            "—"
          )}
        </td>
      )}
      <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{size}</td>
      <td className={cn(CELL, "py-0 text-right")}>
        <RowMenu pkg={pkg} onAction={onAction} onRemove={onRemove} />
      </td>
    </tr>
  );
}
