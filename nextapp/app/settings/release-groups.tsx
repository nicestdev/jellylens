"use client";

import { useState, type FormEvent } from "react";
import { Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-client";
import { plural, relativeTime } from "@/lib/format";
import type { ReleaseGroupItem, ReleaseGroupsResponse } from "@/lib/api-types";
import { cn } from "@/lib/utils";

type Group = ReleaseGroupItem;
type GroupKind = Group["kind"];

const KINDS: { kind: GroupKind; title: string; hint: string; example: string }[] = [
  { kind: "p2p", title: "P2P groups", hint: "Their whole list on xREL, kept in sync.", example: "VECTOR" },
  { kind: "scene", title: "Scene groups", hint: "Their latest releases on xREL; older ones pile up with each sync.", example: "WAYNE" },
];

function groupStatus(g: Group): string {
  const count = plural(g.count, "release");
  if (!g.complete) return g.syncing ? `Loading releases… ${count} so far` : "Waiting for the next sync";
  return `${count} · ${g.syncing ? "syncing…" : `synced ${relativeTime(g.syncedAt)}`}`;
}

// The favorite groups behind the Releases page, a list each for P2P and
// scene. Adding one looks it up on xREL, and its releases load in the
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
    const res = await apiFetch<ReleaseGroupsResponse>("/api/release-groups", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
        <p className="flex items-center gap-1.5 border-b px-4 py-2.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Checking titles on TMDB…
        </p>
      ) : null}
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
  hint,
  example,
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
    <section aria-label={title} className="border-t first:border-t-0">
      <div className="px-4 pt-3">
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      {groups === null ? (
        <div className="px-4 py-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-48" />
        </div>
      ) : (
        <ul className="divide-y">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{g.name}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {g.syncing ? <Loader2 className="size-3 animate-spin" /> : null}
                  {groupStatus(g)}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`More options for ${g.name}`}
                  className={cn(buttonVariants({ variant: "ghost", size: "icon-sm", className: "text-muted-foreground" }))}
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
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className={cn("flex gap-2 p-4", groups?.length ? "border-t" : "pt-3")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Group name, e.g. ${example}`}
          aria-label={`Add to ${title}`}
          className="h-8 w-full sm:w-64"
          disabled={adding}
        />
        <Button type="submit" variant="outline" disabled={adding || !name.trim()}>
          {adding ? <Loader2 className="animate-spin" /> : <Plus />}
          Add
        </Button>
      </form>
    </section>
  );
}
