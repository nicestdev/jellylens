"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SortDir } from "@/lib/facets";
import { cn } from "@/lib/utils";

export type SortOption<K extends string> = { key: K; label: string; defaultDir: SortDir };

// Toolbar sort control: a menu to pick the key plus a direction toggle.
// Picking a key resets the direction to that key's default.
export function SortMenu<K extends string>({
  options,
  sortKey,
  sortDir,
  onChange,
}: {
  options: readonly SortOption<K>[];
  sortKey: K;
  sortDir: SortDir;
  onChange: (key: K, dir: SortDir) => void;
}) {
  const current = options.find((o) => o.key === sortKey) ?? options[0];
  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", className: "text-muted-foreground" }))}>
          <ArrowUpDown />
          {current.label}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-36">
          <DropdownMenuRadioGroup
            value={sortKey}
            onValueChange={(v) => {
              const next = options.find((o) => o.key === v)!;
              onChange(next.key, next.defaultDir);
            }}
          >
            {options.map((o) => (
              <DropdownMenuRadioItem key={o.key} value={o.key} closeOnClick>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground"
        aria-label={sortDir === "asc" ? "Sort descending" : "Sort ascending"}
        title={sortDir === "asc" ? "Ascending" : "Descending"}
        onClick={() => onChange(sortKey, sortDir === "asc" ? "desc" : "asc")}
      >
        {sortDir === "asc" ? <ArrowUp /> : <ArrowDown />}
      </Button>
    </div>
  );
}
