"use client";

import { useState } from "react";
import { MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CELL, MUTED_CELL, NOT_ON_PHONE, NUMBER_CELL, ROW, TITLE_CELL } from "@/components/library-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { formatNumber, plural, relativeTime } from "@/lib/format";
import type { ReleaseGroupItem, ReleaseGroupsResponse } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { ConfirmItem } from "@/components/confirm-item";
import { SETTINGS_COLUMNS } from "./logic";
import { TableFrame } from "@/components/section-frame";
import { AddButton, AddRow } from "./add-row";
import { Dot } from "@/components/dot";

type Group = ReleaseGroupItem;
type GroupKind = Group["kind"];

// P2P: their whole list on xREL, kept in sync. Scene: their latest
// releases on xREL; older ones pile up with each sync.
const KINDS: { kind: GroupKind; title: string; addLabel: string }[] = [
  { kind: "p2p", title: "P2P groups", addLabel: "Add P2P group" },
  { kind: "scene", title: "Scene groups", addLabel: "Add scene group" },
];

// A group's Last sync cell: syncing now, its first list too (Sync with its
// icon spinning, as the Sync buttons above spin), Waiting for its first
// sync, or when it last did.
function groupStatus(g: Group): string {
  if (g.syncing) return "Sync";
  return g.complete ? relativeTime(g.syncedAt) : "Waiting";
}

// The favorite groups behind Discover's releases, a list each for P2P and
// scene, one under the other. Adding one looks it up on xREL, and its releases load in the
// background. The page loads and polls the lists along with the rest
// (data), so they follow a running sync live; onData takes what an add or
// remove answered.
export function ReleaseGroups({
  data,
  onData,
  onError,
}: {
  data: ReleaseGroupsResponse | null;
  onData: (data: ReleaseGroupsResponse) => void;
  onError: (message: string) => void;
}) {
  const groups = data?.items ?? null;

  async function change(method: "POST" | "DELETE", body: object) {
    const res = await apiFetch<ReleaseGroupsResponse>("/api/release-groups", jsonRequest(method, body));
    onData(res);
  }

  async function remove(group: Group) {
    onError("");
    try {
      await change("DELETE", { id: group.id });
    } catch (err) {
      onError(`Couldn't remove ${group.name}: ${(err as Error).message}`);
    }
  }

  return (
    <>
      {KINDS.map((k) => (
        <GroupList
          key={k.kind}
          {...k}
          groups={groups?.filter((g) => g.kind === k.kind) ?? null}
          add={(name) => change("POST", { name, kind: k.kind })}
          remove={remove}
          onError={onError}
        />
      ))}
    </>
  );
}

function GroupList({
  title,
  addLabel,
  groups,
  add,
  remove,
  onError,
}: (typeof KINDS)[number] & {
  groups: Group[] | null;
  add: (name: string) => Promise<void>;
  remove: (group: Group) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  async function submit() {
    const wanted = name.trim();
    onError("");
    setAdding(true);
    try {
      await add(wanted);
      setName("");
    } catch (err) {
      onError(`Couldn't add ${wanted}: ${(err as Error).message}`);
    } finally {
      setAdding(false);
    }
  }

  return (
    <TableFrame
      title={title}
      count={groups?.length}
      minWidth="min-w-0"
      columns={[
        { label: "Group" },
        { label: "Releases", align: "right", width: SETTINGS_COLUMNS.middle, phone: false },
        { label: "Last sync", width: SETTINGS_COLUMNS.lastSync, phone: false },
        {
          label: <AddButton label={addLabel} onClick={() => setOpen(true)} disabled={groups === null} />,
          width: SETTINGS_COLUMNS.action,
        },
      ]}
    >
      {groups === null ? (
        <tr className={ROW}>
          <td colSpan={4} className={CELL}>
            <Skeleton className="h-5 w-full" />
          </td>
        </tr>
      ) : null}
      {(groups ?? []).map((g) => (
        <tr key={g.id} className={ROW}>
          <td className={TITLE_CELL}>
            <span className="font-mono text-xs font-medium">{g.name}</span>
            {/* On a phone its releases and last sync are a line under it. */}
            <div className="truncate text-xs text-muted-foreground sm:hidden">
              {plural(g.count, "release")} <Dot /> {groupStatus(g)}
            </div>
          </td>
          <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{formatNumber(g.count)}</td>
          <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>
            {/* Syncing, as faint as the disabled Sync button above. */}
            <span
              className={cn("inline-flex items-center gap-1 align-top font-mono text-xs", g.syncing && "opacity-50")}
            >
              {g.syncing ? <RefreshCw className="size-3 animate-spin" /> : null}
              {groupStatus(g)}
            </span>
          </td>
          <td className={cn(CELL, "py-0 text-right")}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`More options for ${g.name}`}
                className={cn(
                  buttonVariants({
                    variant: "ghost",
                    size: "icon-xs",
                    className: "align-middle text-muted-foreground",
                  }),
                )}
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto">
                <ConfirmItem plain icon={Trash2} label={`Remove ${g.name}`} onConfirm={() => remove(g)} />
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
      ))}
      {open || adding ? (
        <AddRow
          value={name}
          onChange={setName}
          onSubmit={submit}
          onClose={() => setOpen(false)}
          placeholder={addLabel}
          columns={4}
          adding={adding}
          className="font-medium"
        />
      ) : null}
    </TableFrame>
  );
}
