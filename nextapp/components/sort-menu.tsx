"use client";

import { SortIcon } from "@/components/design-icons";
import { buttonVariants } from "@/components/ui/button";
import { TOOLBAR_BUTTON } from "@/components/filter-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SortDir } from "@/lib/facets";
import { cn } from "@/lib/utils";

export type SortOption<K extends string> = { key: K; label: string; defaultDir: SortDir };

// How a direction reads next to the key in the menu and the button's
// label: "Title A–Z", "Date newest".
function dirLabel(key: string, dir: SortDir): string {
  if (key === "title" || key === "name") return dir === "asc" ? "A–Z" : "Z–A";
  if (key === "date" || key === "year" || key === "added") return dir === "asc" ? "oldest" : "newest";
  if (key === "wanted") return dir === "asc" ? "least" : "most";
  return dir === "asc" ? "lowest" : "highest";
}

// Toolbar sort control, one button: "⇅ Title", the key only, the direction
// in its menu. Its menu picks the key
// (with that key's default direction); picking the current one again turns
// the direction around.
export function SortMenu<K extends string>({
  options,
  sortKey,
  sortDir,
  onChange,
  className,
}: {
  className?: string;
  options: readonly SortOption<K>[];
  sortKey: K;
  sortDir: SortDir;
  onChange: (key: K, dir: SortDir) => void;
}) {
  const current = options.find((o) => o.key === sortKey) ?? options[0];
  const pick = (key: K) => {
    if (key === sortKey) return onChange(key, sortDir === "asc" ? "desc" : "asc");
    onChange(key, options.find((o) => o.key === key)!.defaultDir);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost" }),
          TOOLBAR_BUTTON,
          "gap-2 px-3 text-foreground max-sm:gap-1.5 max-sm:pr-2.5 max-sm:pl-3",
          className,
        )}
        aria-label={`Sort by ${current.label}, ${dirLabel(current.key, sortDir)}`}
      >
        <SortIcon className="size-3.5" strokeWidth={1.8} />
        <span>{current.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        {options.map((o) => (
          <DropdownMenuItem key={o.key} onClick={() => pick(o.key)} className="justify-between gap-6">
            {o.label}
            {o.key === sortKey ? (
              <span className="text-xs text-muted-foreground">{dirLabel(o.key, sortDir)}</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
