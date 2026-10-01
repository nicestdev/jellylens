"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, MoreHorizontal, Plus, Trash2, Users } from "lucide-react";
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

function groupStatus(g: Group): string {
  const count = plural(g.count, "release");
  if (!g.complete) return g.syncing ? `Loading releases… ${count} so far` : "Waiting for the next sync";
  return `${count} · ${g.syncing ? "syncing…" : `synced ${relativeTime(g.syncedAt)}`}`;
}

// The favorite P2P groups behind the Releases page. Adding one looks it up
// on xREL, and its releases load in the background; the list polls while
// they do. onChange lets the page refresh the Sync row's counts.
export function ReleaseGroups({ onError, onChange }: { onError: (message: string) => void; onChange: () => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<ReleaseGroupsResponse>("/api/release-groups");
      setGroups(res.Items);
      return res.Items;
    } catch (e) {
      onError(`Failed to load release groups: ${(e as Error).message}`);
      return null;
    }
  }, [onError]);

  const busy = groups?.some((g) => g.syncing || !g.complete) ?? false;
  // First load right away, then every 3 s while releases are loading.
  useEffect(() => {
    if (groups !== null && !busy) return;
    const poll = setTimeout(
      async () => {
        const next = await load();
        // Just finished: the Sync row's counts are out of date.
        if (groups && next && !next.some((g) => g.syncing || !g.complete)) onChange();
      },
      groups === null ? 0 : 3000
    );
    return () => clearTimeout(poll);
  }, [groups, busy, load, onChange]);

  async function change(method: "POST" | "DELETE", body: object) {
    const res = await apiFetch<ReleaseGroupsResponse>("/api/release-groups", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setGroups(res.Items);
    onChange();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onError("");
    setAdding(true);
    try {
      await change("POST", { name: name.trim() });
      setName("");
    } catch (err) {
      onError(`Couldn't add ${name.trim()}: ${(err as Error).message}`);
    } finally {
      setAdding(false);
    }
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
    <section className="rounded-xl border bg-card">
      <div className="flex gap-3.5 border-b p-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Users className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Favorite P2P groups</h3>
          <p className="text-sm text-muted-foreground">
            Their releases on xREL show up on the Releases page and stay in sync.
          </p>
        </div>
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

      <form onSubmit={add} className={cn("flex gap-2 p-4", groups?.length ? "border-t" : "")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name, e.g. VECTOR"
          aria-label="Group name"
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
