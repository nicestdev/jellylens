"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileVideo,
  Folder,
  FolderX,
  HardDrive,
  FolderInput,
  MoreHorizontal,
  Replace,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmItem } from "@/components/confirm-item";
import {
  CELL,
  MENU_CELL,
  MUTED_CELL,
  NOT_ON_PHONE,
  NUMBER_CELL,
  PHONE_MENU,
  ROW,
  iconButton,
  type Column,
} from "@/components/library-table";
import { LibraryIcon } from "@/components/library-icon";
import type { OrganizeItem, OrganizeMoved } from "@/lib/api-types";
import type { LibraryTarget, MoveProgress } from "@/lib/library-move";
import { PhoneStatus, StatusCell, type RowState } from "@/components/row-status";
import { formatBytes, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { displayName, errorLine, formatSpeed, releaseName, timeLeft } from "./logic";
import { destination, fits, ownedInFolder, targetOf } from "./organize-logic";

// Title and year, TMDB's or else the release name's (and an icon after them, if given) over a small second
// line, text-xs Mono if mono (a release name), and what's below, if given.
export function TitleCell({
  media,
  name,
  icon,
  line,
  mono,
  below,
  menu,
}: Pick<OrganizeItem, "media" | "name"> & {
  icon?: ReactNode;
  line: ReactNode;
  mono?: boolean;
  below?: ReactNode;
  menu?: ReactNode;
}) {
  const { title, year } = displayName({ media, name });
  return (
    <td className={cn(CELL, "w-full max-w-0")}>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate font-medium">{title}</span>
        {year ? <span className="shrink-0 text-muted-foreground tabular-nums">{year}</span> : null}
        {icon}
        {menu ? <span className={cn(PHONE_MENU, "ml-auto")}>{menu}</span> : null}
      </div>
      <div className={cn("mt-0.75 truncate text-muted-foreground", mono ? "font-mono text-xs" : "text-[0.8125rem]")}>
        {line}
      </div>
      {below}
    </td>
  );
}

// Where the files go, as a little tree, a bit smaller, an icon before each
// line: the disk's folder (only on a phone, elsewhere the Disk column says
// it; there the disk picker, if given), the title's folder, under it a show's season folders, and under
// those (or the title's folder) every file, each a step further in. With
// old (what the library has already) like a diff: those with a "−" before
// them (red), the new ones with a "+" (green). A season folder shows its
// files under its name and a chevron, a click folds it.
// kept: what the library has that stays (a Skip in Needs attention),
// marked "∗" (blue); the files are "+" then too.
export function FileTree({
  root,
  folder,
  files,
  old = [],
  kept = [],
}: {
  root: ReactNode;
  folder: string;
  files: string[];
  old?: string[];
  kept?: string[];
}) {
  // key: unique in the tree (two seasons can hold a file of the same name).
  const line = (key: string, Icon: LucideIcon, text: ReactNode, depth: number, className?: string, mark?: string) => (
    <div
      key={key}
      className={cn("flex min-w-0 items-center gap-1", className)}
      style={{ paddingLeft: `${depth * 0.75}rem` }}
    >
      {mark ? (
        <span
          className={cn(
            "w-2 shrink-0",
            mark === "−" ? "text-destructive" : mark === "∗" ? "text-info" : "text-success",
          )}
        >
          {mark}
        </span>
      ) : null}
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
  // Files by the folder they're in under the title's ("" or "Season 01"),
  // the old ones first.
  const mark = old.length || kept.length ? "+" : undefined;
  const dirs = new Map<string, { name: string; mark?: string }[]>();
  const add = (f: string, mark?: string) => {
    const cut = f.lastIndexOf("/");
    const dir = cut < 0 ? "" : f.slice(0, cut);
    dirs.set(dir, [...(dirs.get(dir) ?? []), { name: f.slice(cut + 1), mark }]);
  };
  for (const f of old) add(f, "−");
  for (const f of kept) add(f, "∗");
  for (const f of files) add(f, mark);
  // Every folder open, a click folds it (kept as which were clicked).
  const [flipped, setFlipped] = useState(new Set<string>());
  const isOpen = (dir: string) => !flipped.has(dir);
  const toggle = (dir: string) =>
    setFlipped((o) => {
      const next = new Set(o);
      if (!next.delete(dir)) next.add(dir);
      return next;
    });
  return (
    <div className="font-mono text-xs leading-4">
      {root ? line("root", HardDrive, root, 0, "font-sans sm:hidden") : null}
      {line("folder", Folder, folder, 0)}
      {[...dirs].map(([dir, names]) => {
        const shown = !dir || isOpen(dir) ? names : [];
        return [
          dir ? (
            <button
              key={`dir:${dir}`}
              type="button"
              aria-expanded={isOpen(dir)}
              onClick={() => toggle(dir)}
              className="flex min-w-0 cursor-pointer items-center gap-1 pl-3 text-left outline-none hover:text-foreground"
            >
              <Folder className="size-3 shrink-0" />
              <span className="truncate">{dir}</span>
              <ChevronRight
                className={cn("size-3 shrink-0 text-muted-foreground transition-transform", isOpen(dir) && "rotate-90")}
              />
            </button>
          ) : null,
          ...shown.map((n) =>
            line(`${dir}/${n.mark ?? ""}${n.name}`, FileVideo, n.name, dir ? 2 : 1, undefined, n.mark),
          ),
        ];
      })}
    </div>
  );
}

// A move as a row's state (components/row-status.tsx): a bar of the
// phase it's in (copying, then verifying), peach while it waits, green
// while it's copied, sky while it's verified; under it the state, speed and
// time left.
function moveState(move: MoveProgress): RowState {
  const fraction = move.total ? Math.min(1, move.done / move.total) : 0;
  const left = move.running ? timeLeft(move.total - move.done, move.speed) : null;
  const speed = move.running && move.speed ? formatSpeed(move.speed) : null;
  return {
    line: [moveLabel(move), speed, speed ? left : null],
    bar: { fraction, color: !move.running ? "bg-warning" : move.phase === "copying" ? "bg-success" : "bg-info" },
  };
}

// What a move is doing: Waiting, Moving or Verifying.
function moveLabel(move: MoveProgress): string {
  if (!move.running) return "Waiting";
  return move.phase === "copying" ? "Moving" : "Verifying";
}

// One plain item of the ⋯ menu.
export function ActionItem({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <DropdownMenuItem onClick={onClick}>
      <Icon />
      {label}
    </DropdownMenuItem>
  );
}

// The ⋯ of a row, a package's too: what can be done now (here Move or
// Replace, Retry, Delete; Undo); none while it moves. In the title's line
// on a phone, in its own column elsewhere (MENU_CELL).
export function ActionMenu({ name, children }: { name: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`More for ${name}`} className={iconButton}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto max-w-[min(32rem,90vw)]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The columns of every table on the Queue, its packages' rows too: title
// (headed with the section, "Downloading · 2"), disk, status, size, ⋯;
// fixed widths so the sections line up. Each fits its widest value plus
// padding: a bar with "Loading · 999.99 KB/s · 12 h 59 min" under it;
// "999.99 GB".
export const downloadColumns: Column[] = [
  { label: "Title" },
  { label: "Disk", width: "w-24", phone: false },
  { label: "Status", width: "w-64", phone: false },
  { label: "Size", align: "right", width: "w-[6.875rem]", phone: false },
  { label: "Actions", hidden: true, width: "w-14", phone: false },
];

// The disk picker: the disk picked (or label); open, each disk with its free space,
// the one that has the title already marked, one it doesn't fit on not to
// be picked (red).
function DiskMenu({
  item,
  target,
  label,
  className,
  onPick,
}: {
  item: OrganizeItem;
  target: LibraryTarget | null;
  label?: string | null;
  className?: string;
  onPick: (t: LibraryTarget) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex w-full cursor-pointer items-baseline gap-1.5 rounded-md text-left text-muted-foreground outline-none hover:text-primary",
          // Nothing picked yet: it waits for a hand.
          !target && "text-warning",
          className,
        )}
        aria-label={`Disk: ${label ?? target?.disk ?? "Pick"}`}
      >
        <span className="truncate font-mono text-xs">{label ?? target?.disk ?? "Pick"}</span>
        <ChevronDown className="size-3 self-center text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56">
        {item.targets.map((t) => (
          <DropdownMenuItem key={t.path} disabled={!fits(item, t)} onClick={() => onPick(t)} className="gap-3">
            <Check className={cn("size-3.5", t.path !== target?.path && "invisible")} />
            <span className="flex-1 font-mono text-xs">{t.disk}</span>
            {t.existing ? <span className="text-xs text-muted-foreground">has it</span> : null}
            <span className={cn("font-mono text-xs", fits(item, t) ? "text-muted-foreground" : "text-destructive")}>
              {t.freeBytes !== null ? `${formatBytes(t.freeBytes)} free` : "?"}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// A finished download not in the library yet: its title over where it goes
// on the disk picked, the title's folder over its files (one that can't be
// moved, its release name; after the title the library icon when the
// library has it, what it has marked "−" in the tree); the disk; where it's at
// ("—", or what it takes out and adds like git, "−1 +1", red and green; while it's moved its bar; after a failure or when it can't be
// moved why, red); its size; the ⋯ menu
// (Move, or Replace when the library has it, one version of everything;
// or Retry; then Delete for every one not moving, the only one for one
// that can't be moved: off the list, its files too, so none are left
// behind in the downloads folder). On a phone the disk picker is the tree's first line,
// and where it's at folds under the title, with the size.
export function OrganizeRow({
  item,
  picked,
  onPick,
  onMove,
  onDelete,
}: {
  item: OrganizeItem;
  picked?: string;
  onPick: (target: string) => void;
  onMove: (target: string, replace?: boolean) => void;
  onDelete: () => void;
}) {
  const move = item.move;
  const target = targetOf(item, picked);
  const moving = move && !move.error ? move : null;
  const place = destination(item, target);
  const owned = item.owned.length > 0;
  // No tooltip: the tree under it lists the files the library has.
  const icon = owned ? <LibraryIcon className="self-center" /> : null;
  const error = item.error ?? move?.error;
  const old = moving ? [] : ownedInFolder(item);
  const state: RowState = moving
    ? moveState(moving)
    : error
      ? { line: errorLine(error), tone: "error" }
      : old.length
        ? {
            line: (
              <span className="font-mono">
                <span className="text-destructive">−{old.length}</span>{" "}
                <span className="text-success">+{item.files.length}</span>
              </span>
            ),
          }
        : { line: "—" };
  const go = (replace?: boolean) => target && onMove(target.path, replace);
  const pickable = !item.error && !move;
  const size = item.bytes ? formatBytes(item.bytes) : "—";
  const drop = <ConfirmItem icon={Trash2} label="Delete" onConfirm={onDelete} />;
  const actions = moving ? null : item.error || !target ? (
    drop
  ) : move?.error ? (
    <>
      <ActionItem icon={RotateCcw} label="Retry" onClick={() => go()} />
      {drop}
    </>
  ) : owned ? (
    <>
      <ConfirmItem icon={Replace} label="Replace" onConfirm={() => go(true)} />
      {drop}
    </>
  ) : (
    <>
      <ActionItem icon={FolderInput} label="Move" onClick={() => go()} />
      {drop}
    </>
  );
  const menu = actions ? <ActionMenu name={item.name}>{actions}</ActionMenu> : null;
  return (
    <tr className={cn(ROW, "h-17")}>
      <TitleCell
        media={item.media}
        name={item.name}
        icon={icon}
        line={
          item.error || !item.files.length ? (
            // Like the tree's lines, a crossed-out folder for one that can't be moved.
            <span className="flex min-w-0 items-center gap-1 leading-4">
              <FolderX className="size-3 shrink-0" />
              <span className="truncate font-mono">{releaseName(item.name)}</span>
            </span>
          ) : (
            <FileTree
              root={
                pickable ? (
                  <DiskMenu
                    item={item}
                    target={target}
                    label={place.root}
                    className="w-auto"
                    onPick={(t) => onPick(t.path)}
                  />
                ) : (
                  place.root
                )
              }
              folder={place.folder}
              files={item.files}
              old={old}
            />
          )
        }
        below={<PhoneStatus state={state} right={state.bar ? undefined : size} />}
        menu={menu}
      />
      <td className={cn(CELL, NOT_ON_PHONE)}>
        {!pickable ? (
          <span className="font-mono text-xs text-muted-foreground">{target?.disk ?? "—"}</span>
        ) : (
          <DiskMenu item={item} target={target} onPick={(t) => onPick(t.path)} />
        )}
      </td>
      <StatusCell state={state} />
      <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{size}</td>
      <td className={MENU_CELL}>{menu}</td>
    </tr>
  );
}

// A download moved into the library: its title over the folder it went to
// and its files, as a tree like Organize's, the disk, when it was moved or
// replaced, its size.
export function MovedRow({ item }: { item: OrganizeMoved }) {
  const cut = item.movedTo.lastIndexOf("/");
  const state: RowState = { line: `${item.replaced ? "Replaced" : "Moved"} ${relativeTime(item.movedAt)}` };
  const size = item.bytes ? formatBytes(item.bytes) : "—";
  return (
    <tr className={cn(ROW, "h-17")}>
      <TitleCell
        media={item.media}
        name={item.name}
        line={<FileTree root={item.movedTo.slice(0, cut)} folder={item.movedTo.slice(cut + 1)} files={item.files} />}
        below={<PhoneStatus state={state} right={size} />}
      />
      <td className={cn(MUTED_CELL, NOT_ON_PHONE, "font-mono text-xs")}>{item.movedTo.split("/")[0]}</td>
      <StatusCell state={state} />
      <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{size}</td>
      <td className={MENU_CELL} />
    </tr>
  );
}
