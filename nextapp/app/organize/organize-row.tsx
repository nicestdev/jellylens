"use client";

import { type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  CopyPlus,
  FileVideo,
  Folder,
  FolderX,
  HardDrive,
  FolderInput,
  MoreHorizontal,
  Replace,
  RotateCcw,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmItem } from "@/components/confirm-item";
import { InLibraryIcon } from "@/components/in-library-icon";
import {
  CELL,
  MENU_CELL,
  MUTED_CELL,
  NOT_ON_PHONE,
  NUMBER_CELL,
  PHONE_MENU,
  ROW,
  type Column,
} from "@/components/library-table";
import type { OrganizeItem, OrganizeMoved } from "@/lib/api-types";
import type { LibraryTarget, MoveProgress } from "@/lib/library-move";
import { PhoneStatus, StatusCell, type RowState } from "@/components/row-status";
import { buttonVariants } from "@/components/ui/button";
import { formatBytes, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorLine, formatSpeed, releaseName, timeLeft } from "../downloads/logic";
import { destination, fits, ownedInFolder, targetOf } from "./logic";

// Title and year (and an icon after them, if given) over a mono second
// line (and what's below, if given).
function TitleCell({
  media,
  name,
  icon,
  line,
  hint,
  below,
  menu,
}: Pick<OrganizeItem, "media" | "name"> & {
  icon?: ReactNode;
  line: ReactNode;
  hint?: string;
  below?: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <td className="w-full max-w-0 px-3 py-2">
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate font-medium">{media?.title ?? releaseName(name)}</span>
        {media?.year ? <span className="shrink-0 font-num text-xs text-muted-foreground">{media.year}</span> : null}
        {icon}
        {menu ? <span className={cn(PHONE_MENU, "ml-auto")}>{menu}</span> : null}
      </div>
      <div className="truncate font-mono text-xs text-muted-foreground" title={hint}>
        {line}
      </div>
      {below}
    </td>
  );
}

// Where the files go, as a little tree, a bit smaller, an icon before each
// line: the disk's folder (only on a phone, elsewhere the Disk column says
// it; there the disk picker, if given), the title's folder, under it a show's season folders, and under
// those (or the title's folder) every file, each a step further in; a
// file's whole name on hover. With old (what the library has already) like
// a diff: those red, the new ones green.
function FileTree({
  root,
  folder,
  files,
  old = [],
}: {
  root: ReactNode;
  folder: string;
  files: string[];
  old?: string[];
}) {
  const line = (Icon: LucideIcon, text: ReactNode, depth: number, hint?: string, className?: string) => (
    <div
      key={`${depth}:${className ?? ""}:${typeof text === "string" ? text : "root"}`}
      title={hint}
      className={cn("flex min-w-0 items-center gap-1", className)}
      style={{ paddingLeft: `${depth * 0.75}rem` }}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
  // Files by the folder they're in under the title's ("" or "Season 01"),
  // the old ones first.
  const tone = old.length ? "text-success" : undefined;
  const dirs = new Map<string, { name: string; tone?: string }[]>();
  const add = (f: string, tone?: string) => {
    const cut = f.lastIndexOf("/");
    const dir = cut < 0 ? "" : f.slice(0, cut);
    dirs.set(dir, [...(dirs.get(dir) ?? []), { name: f.slice(cut + 1), tone }]);
  };
  for (const f of old) add(f, "text-destructive");
  for (const f of files) add(f, tone);
  return (
    <div className="text-xs leading-4">
      {root ? line(HardDrive, root, 0, undefined, "sm:hidden") : null}
      {line(Folder, folder, 0)}
      {[...dirs].map(([dir, names]) => [
        dir ? line(Folder, dir, 1) : null,
        ...names.map((n) => line(FileVideo, n.name, dir ? 2 : 1, n.name, n.tone)),
      ])}
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
    line: [moveLabel(move), speed, speed ? left : null].filter(Boolean).join(" · "),
    bar: { fraction, color: !move.running ? "bg-warning" : move.phase === "copying" ? "bg-success" : "bg-info" },
  };
}

// What a move is doing: Waiting, Moving, Verifying, or Undoing for an Undo
// in either phase.
function moveLabel(move: MoveProgress): string {
  if (!move.running) return "Waiting";
  if (move.back) return "Undoing";
  return move.phase === "copying" ? "Moving" : "Verifying";
}

// One plain item of the ⋯ menu.
function ActionItem({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <DropdownMenuItem onClick={onClick}>
      <Icon />
      {label}
    </DropdownMenuItem>
  );
}

// The ⋯ of a row, like a download's: what can be done now (Move; Add as
// version, Replace, Delete; Retry; Undo); none while it moves. In the
// title's line on a phone, in its own column elsewhere (MENU_CELL).
function ActionMenu({ name, children }: { name: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`More for ${name}`} title="More" className={iconButton}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const iconButton = cn(buttonVariants({ variant: "ghost", size: "icon-sm", className: "text-muted-foreground" }));

// The columns of both tables, lined up like Downloads': title, disk,
// status, size, ⋯.
export const ORGANIZE_COLUMNS: Column[] = [
  { label: "Title" },
  { label: "Disk", width: "w-24", phone: false },
  { label: "Status", width: "w-64", phone: false },
  { label: "Size", align: "right", width: "w-24", phone: false },
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
          className,
        )}
        aria-label="Disk"
      >
        <span className="truncate">{label ?? target?.disk ?? "Pick"}</span>
        <ChevronDown className="size-3 self-center text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56">
        {item.targets.map((t) => (
          <DropdownMenuItem key={t.path} disabled={!fits(item, t)} onClick={() => onPick(t)} className="gap-3">
            <Check className={cn("size-3.5", t.path !== target?.path && "invisible")} />
            <span className="flex-1">{t.disk}</span>
            {t.existing ? <span className="text-xs text-muted-foreground">has it</span> : null}
            <span
              className={cn(
                "font-num text-xs tabular-nums",
                fits(item, t) ? "text-muted-foreground" : "text-destructive",
              )}
            >
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
// library has it, what it has red in the tree); the disk; where it's at
// ("—"; while it's moved its bar; after a failure or when it can't be
// moved why, red); its size; the ⋯ menu
// (Move, or Add as version, Replace and Delete the download, red ones
// last, or Retry; only Delete for one that can't be moved). On a phone the disk picker is the tree's first line,
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
  // Like Downloads': peach, the tooltip says whether a file of the same
  // name is there already (this very release) or another one.
  const ownedNames = item.owned.map((o) => o.path.split("/").pop()!);
  const exact = item.files.some((f) => ownedNames.includes(f.split("/").pop()!));
  const icon = owned ? (
    <InLibraryIcon label={exact ? "This release in library" : "In library"} hint={ownedNames.join(", ")} exact />
  ) : null;
  const error = item.error ?? move?.error;
  const state: RowState = moving
    ? moveState(moving)
    : error
      ? { line: errorLine(error), hint: error, tone: "error" }
      : { line: "—" };
  const go = (replace?: boolean) => target && onMove(target.path, replace);
  const pickable = !item.error && !move;
  const size = item.bytes ? formatBytes(item.bytes) : "—";
  const actions = item.error ? (
    <ConfirmItem icon={Trash2} label="Delete" onConfirm={onDelete} />
  ) : moving || !target ? null : move?.error ? (
    <ActionItem icon={RotateCcw} label="Retry" onClick={() => go()} />
  ) : owned ? (
    <>
      <ActionItem icon={CopyPlus} label="Add as version" onClick={() => go(false)} />
      <ConfirmItem icon={Replace} label="Replace" onConfirm={() => go(true)} />
      <ConfirmItem icon={Trash2} label="Delete" onConfirm={onDelete} />
    </>
  ) : (
    <ActionItem icon={FolderInput} label="Move" onClick={() => go()} />
  );
  const menu = actions ? <ActionMenu name={item.name}>{actions}</ActionMenu> : null;
  return (
    <tr className={ROW}>
      <TitleCell
        media={item.media}
        name={item.name}
        icon={icon}
        line={
          item.error || !item.files.length ? (
            // Like the tree's lines, a crossed-out folder for one that can't be moved.
            <span className="flex min-w-0 items-center gap-1 leading-4">
              <FolderX className="size-3 shrink-0" />
              <span className="truncate">{releaseName(item.name)}</span>
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
              old={moving ? [] : ownedInFolder(item)}
            />
          )
        }
        hint={item.error || !item.files.length ? item.name : undefined}
        below={<PhoneStatus state={state} right={state.bar ? undefined : size} />}
        menu={menu}
      />
      <td className={cn(CELL, NOT_ON_PHONE)}>
        {!pickable ? (
          <span className="text-muted-foreground">{target?.disk ?? "—"}</span>
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

// A download moved into the library: its title over where it went (like
// New's), the disk, when it was moved or replaced (while Undo runs its
// bar, red if it failed), its size, the ⋯ menu (Undo: back to New, or
// Retry; nothing for one that replaced what the library had).
export function MovedRow({ item, onUndo }: { item: OrganizeMoved; onUndo: () => void }) {
  const cut = item.movedTo.lastIndexOf("/");
  const move = item.move;
  const moving = move && !move.error ? move : null;
  const state: RowState = moving
    ? moveState(moving)
    : move?.error
      ? { line: errorLine(move.error), hint: move.error, tone: "error" }
      : {
          line: `${item.replaced ? "Replaced" : "Moved"} ${relativeTime(item.movedAt)}`,
          hint: new Date(item.movedAt).toLocaleString("de-DE"),
        };
  const size = item.bytes ? formatBytes(item.bytes) : "—";
  const actions =
    moving || !item.files.length || item.replaced ? null : move?.error ? (
      <ActionItem icon={RotateCcw} label="Retry" onClick={onUndo} />
    ) : (
      <ActionItem icon={Undo2} label="Undo" onClick={onUndo} />
    );
  const menu = actions ? <ActionMenu name={item.name}>{actions}</ActionMenu> : null;
  return (
    <tr className={ROW}>
      <TitleCell
        media={item.media}
        name={item.name}
        line={<FileTree root={item.movedTo.slice(0, cut)} folder={item.movedTo.slice(cut + 1)} files={item.files} />}
        below={<PhoneStatus state={state} right={state.bar ? undefined : size} />}
        menu={menu}
      />
      <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>{item.movedTo.split("/")[0]}</td>
      <StatusCell state={state} />
      <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{size}</td>
      <td className={MENU_CELL}>{menu}</td>
    </tr>
  );
}
