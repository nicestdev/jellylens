"use client";

import { Eye, MoreHorizontal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CELL, MUTED_CELL, ROW, TITLE_CELL } from "@/components/library-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableFrame } from "@/components/section-frame";
import { apiFetch, jsonRequest, loadShowsAndIgnores } from "@/lib/api-client";
import type { IgnoreEntry, IgnoredResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { cn } from "@/lib/utils";
import { ignoredList } from "./logic";

// The shows ignored on the Dashboard's Incomplete shows: the show,
// Unignore in the ⋯.
export function IgnoredShows({ onError }: { onError: (message: string) => void }) {
  const page = useLoad(loadShowsAndIgnores);
  const entries = page.data ? ignoredList(page.data.shows, page.data.ignored) : null;

  async function unignore(entry: IgnoreEntry) {
    onError("");
    try {
      const res = await apiFetch<IgnoredResponse>("/api/ignored", jsonRequest("DELETE", entry));
      page.setData((d) => d && { ...d, ignored: res.items });
    } catch (e) {
      onError(`Couldn't unignore: ${(e as Error).message}`);
    }
  }

  return (
    <TableFrame
      title="Ignored incomplete shows"
      count={entries?.length}
      minWidth="min-w-0"
      columns={[{ label: "Show" }, { label: "Actions", hidden: true }]}
    >
      {entries === null ? (
        <tr className={ROW}>
          <td colSpan={2} className={CELL}>
            <Skeleton className="h-5 w-full" />
          </td>
        </tr>
      ) : entries.length === 0 ? (
        <tr className={ROW}>
          <td colSpan={2} className={MUTED_CELL}>
            None yet
          </td>
        </tr>
      ) : null}
      {(entries ?? []).map(({ entry, name }) => (
        <tr key={entry.showId} className={ROW}>
          <td className={cn(TITLE_CELL, "font-medium")}>{name}</td>
          <td className={cn(CELL, "py-0 text-right")}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`More options for ${name}`}
                className={buttonVariants({
                  variant: "ghost",
                  size: "icon-xs",
                  className: "align-middle text-muted-foreground",
                })}
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto">
                <DropdownMenuItem onClick={() => unignore(entry)}>
                  <Eye />
                  Unignore
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
      ))}
    </TableFrame>
  );
}
