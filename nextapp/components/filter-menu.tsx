"use client";

import { Check, ChevronDown, ListFilter, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// One multi-select facet (Status, Genre, Language, …) of the toolbar filter.
export type Facet = {
  key: string;
  label: string;
  values: string[];
  counts?: Map<string, number>; // how many items each value matches, if known
  selected: Set<string>;
  onToggle: (value: string) => void;
  format?: (value: string) => string;
};

function CountPill({ n }: { n: number }) {
  return (
    <span className="rounded-sm bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">{n}</span>
  );
}

function FacetOptions({ facet }: { facet: Facet }) {
  const format = facet.format ?? ((v: string) => v);
  return facet.values.map((value) => {
    const checked = facet.selected.has(value);
    return (
      <DropdownMenuCheckboxItem
        key={value}
        checked={checked}
        onCheckedChange={() => facet.onToggle(value)}
        // Swap the built-in trailing check for a leading checkbox, the usual
        // look for a multi-select list.
        className="gap-2.5 pr-2 [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
      >
        <span
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors",
            checked ? "border-primary bg-primary text-primary-foreground" : "border-input"
          )}
        >
          {checked ? <Check className="size-3" /> : null}
        </span>
        <span className="flex-1">{format(value)}</span>
        {facet.counts ? (
          <span className="ml-6 text-xs text-muted-foreground tabular-nums">{facet.counts.get(value) ?? 0}</span>
        ) : null}
      </DropdownMenuCheckboxItem>
    );
  });
}

// All toolbar filters behind one "Filter" button: one scrolling checklist
// grouped by facet (no nested menus — on phones they covered each other).
// The button shows how many values are selected in total, and the menu stays
// open while toggling.
export function FilterMenu({ facets }: { facets: Facet[] }) {
  const shown = facets.filter((f) => f.values.length > 0);
  if (shown.length === 0) return null;
  const active = shown.reduce((sum, f) => sum + f.selected.size, 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // cn() dedupes the base border-transparent against the variant's
        // border color; buttonVariants() alone doesn't, and the border vanishes.
        className={cn(
          buttonVariants({ variant: "outline" }), // h-8, same as the search input
          "shrink-0",
          active > 0 && "border-primary/50 bg-primary/10 text-foreground"
        )}
      >
        <ListFilter />
        Filter
        {active > 0 ? <CountPill n={active} /> : null}
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[min(28rem,var(--available-height))] w-auto min-w-56 pt-0">
        {shown.map((facet, i) => (
          <DropdownMenuGroup key={facet.key}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            {/* Sticky, so the section you're scrolling through stays named. */}
            <DropdownMenuLabel className="sticky top-0 z-10 flex items-center gap-2 bg-popover pt-2">
              <span className="flex-1">{facet.label}</span>
              {facet.selected.size > 0 ? <CountPill n={facet.selected.size} /> : null}
            </DropdownMenuLabel>
            <FacetOptions facet={facet} />
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type FilterChip = { id: string; label: string; onRemove: () => void };

// The active selections of the toolbar's FilterMenus as removable chips, plus
// "Clear all". Renders nothing while nothing is selected.
export function FilterChips({ chips, onClear }: { chips: FilterChip[]; onClear: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={chip.onRemove}
          className="flex items-center gap-1 rounded-md bg-primary/10 py-0.5 pr-1 pl-2 text-xs font-medium text-foreground transition-colors hover:bg-primary/20"
        >
          {chip.label}
          <X className="size-3 text-muted-foreground" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}
