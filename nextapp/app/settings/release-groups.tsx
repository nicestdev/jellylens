"use client";

import { useState, type FormEvent } from "react";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CELL, DataTable, MUTED_CELL, NOT_ON_PHONE, NUMBER_CELL, ROW, TITLE_CELL } from "@/components/library-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { formatNumber, relativeTime } from "@/lib/format";
import type { ReleaseGroupItem, ReleaseGroupsResponse } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { SECTION } from "./logic";
import { AddRow } from "./add-row";
import { SectionTitle } from "@/components/section-title";

type Group = ReleaseGroupItem;
type GroupKind = Group["kind"];

const KINDS: { kind: GroupKind; title: string; hint: string }[] = [
  { kind: "p2p", title: "P2P groups", hint: "Their whole list on xREL, kept in sync." },
  {
    kind: "scene",
    title: "Scene groups",
    hint: "Their latest releases on xREL; older ones pile up with each sync.",
  },
];

// A group's Last sync cell: still loading its first list, waiting for it,
// syncing now, or when it last did.
function groupStatus(g: Group): string {
  if (!g.complete) return g.syncing ? "loading…" : "waiting for the next sync";
  return g.syncing ? "syncing…" : relativeTime(g.syncedAt);
}

// The favorite groups behind the Releases page, a list each for P2P and
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
  const groups = data?.Items ?? null;

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
      {data?.matching ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Checking release titles on TMDB…
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-3">
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
      </div>
    </>
  );
}

function GroupList({
  title,
  hint,
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
  const [adding, setAdding] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const wanted = name.trim();
    if (!wanted) return;
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
    <section aria-label={title} className={cn("min-w-0", SECTION)}>
      <SectionTitle count={groups?.length} hint={hint}>
        {title}
      </SectionTitle>
      {groups === null ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <DataTable
          flat
          columns={[
            { label: "Group" },
            { label: "Releases", align: "right", phone: false },
            { label: "Last sync", phone: false },
            { label: "Options", hidden: true },
          ]}
        >
          {groups.map((g) => (
            <tr key={g.id} className={ROW}>
              <td className={TITLE_CELL} title={g.name}>
                <span className="font-medium">{g.name}</span>
                {/* On a phone its releases and last sync are a line under it. */}
                <div className="truncate text-xs text-muted-foreground sm:hidden">
                  {formatNumber(g.count)} releases · {groupStatus(g)}
                </div>
              </td>
              <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{formatNumber(g.count)}</td>
              <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>
                <span className="inline-flex items-center gap-1 align-top">
                  {g.syncing ? <Loader2 className="size-3 animate-spin" /> : null}
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
                    <DropdownMenuItem variant="destructive" onClick={() => remove(g)}>
                      <Trash2 />
                      Remove {g.name}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      <AddRow value={name} onChange={setName} onSubmit={submit} label={`Add to ${title}`} adding={adding} />
    </section>
  );
}
