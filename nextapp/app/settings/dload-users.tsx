"use client";

import { useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CELL, MUTED_CELL, NOT_ON_PHONE, NUMBER_CELL, ROW, TITLE_CELL } from "@/components/library-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { formatNumber, plural } from "@/lib/format";
import type { DloadUsersResponse } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { ConfirmItem } from "@/components/confirm-item";
import { SETTINGS_COLUMNS } from "./logic";
import { TableFrame } from "@/components/section-frame";
import { AddButton, AddRow } from "./add-row";
import { Dot } from "@/components/dot";

type User = DloadUsersResponse["items"][number];

// The uploaders on DLoad whose threads the DLoad sync reads: their name,
// how many threads it knows, and the group most of them are of (the
// Migrations target). Added by their profile's link, which starts a sync;
// removing one drops their threads. The page loads and polls the list with
// the rest (data); onData takes what an add or remove answered.
export function DloadUsers({
  data,
  onData,
  onError,
}: {
  data: DloadUsersResponse | null;
  onData: (data: DloadUsersResponse) => void;
  onError: (message: string) => void;
}) {
  const users = data?.items ?? null;
  const [link, setLink] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  async function submit() {
    onError("");
    setAdding(true);
    try {
      onData(await apiFetch<DloadUsersResponse>("/api/dload-users", jsonRequest("POST", { link: link.trim() })));
      setLink("");
    } catch (err) {
      onError(`Couldn't add the uploader: ${(err as Error).message}`);
    } finally {
      setAdding(false);
    }
  }

  async function remove(user: User) {
    onError("");
    try {
      onData(await apiFetch<DloadUsersResponse>("/api/dload-users", jsonRequest("DELETE", { id: user.id })));
    } catch (err) {
      onError(`Couldn't remove ${user.name}: ${(err as Error).message}`);
    }
  }

  return (
    <TableFrame
      title="DLoad uploaders"
      count={users?.length}
      minWidth="min-w-0"
      columns={[
        { label: "Uploader" },
        { label: "Threads", align: "right", width: SETTINGS_COLUMNS.middle, phone: false },
        { label: "Group", align: "right", width: SETTINGS_COLUMNS.lastSync, phone: false },
        {
          label: <AddButton label="Add DLoad uploader" onClick={() => setOpen(true)} disabled={users === null} />,
          width: SETTINGS_COLUMNS.action,
        },
      ]}
    >
      {users === null ? (
        <tr className={ROW}>
          <td colSpan={4} className={CELL}>
            <Skeleton className="h-5 w-full" />
          </td>
        </tr>
      ) : users.length === 0 && !open ? (
        <tr className={ROW}>
          <td className={MUTED_CELL} colSpan={4}>
            None yet
          </td>
        </tr>
      ) : null}
      {(users ?? []).map((u) => (
        <tr key={u.id} className={ROW}>
          <td className={TITLE_CELL}>
            <span className="font-medium">{u.name}</span>
            {/* On a phone its threads and group are a line under it. */}
            <div className="truncate text-xs text-muted-foreground sm:hidden">
              {plural(u.threads, "thread")} <Dot /> <span className="font-mono">{u.group}</span>
            </div>
          </td>
          <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{formatNumber(u.threads)}</td>
          <td className={cn(MUTED_CELL, NOT_ON_PHONE, "text-right font-mono text-xs")}>{u.group}</td>
          <td className={cn(CELL, "py-0 text-right")}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`More options for ${u.name}`}
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
                <ConfirmItem plain icon={Trash2} label={`Remove ${u.name}`} onConfirm={() => remove(u)} />
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
      ))}
      {open || adding ? (
        <AddRow
          value={link}
          onChange={setLink}
          onSubmit={submit}
          onClose={() => setOpen(false)}
          placeholder="Add uploader by profile link"
          columns={4}
          adding={adding}
          className="font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
      ) : null}
    </TableFrame>
  );
}
