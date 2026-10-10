"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// One multi-select facet (Status, Genre, Language, …) of a toolbar.
// single: one value always picked, like a radio group (Upgrades: the
// group, the quality); onToggle picks it. It counts as one filter while
// it's off its default (changed).
export type Facet = {
  key: string;
  label: string;
  values: string[];
  counts?: Map<string, number>; // how many items each value matches, if known
  selected: Set<string>;
  onToggle: (value: string) => void;
  format?: (value: string) => string;
  single?: boolean;
  changed?: boolean;
};

const activeIn = (f: Facet) => (f.single ? Number(Boolean(f.changed)) : f.selected.size);

function CountPill({ n }: { n: number }) {
  return (
    <span className="rounded-sm bg-primary px-1 text-xs font-semibold text-primary-foreground tabular-nums">{n}</span>
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
        {facet.single ? (
          <span
            className={cn(
              "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
              checked ? "border-primary" : "border-input",
            )}
          >
            {checked ? <span className="size-2 rounded-full bg-primary" /> : null}
          </span>
        ) : (
          <span
            className={cn(
              "grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors",
              checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
            )}
          >
            {checked ? <Check className="size-3" /> : null}
          </span>
        )}
        <span className="flex-1">{format(value)}</span>
        {facet.counts ? (
          <span className="ml-6 text-xs text-muted-foreground tabular-nums">{facet.counts.get(value) ?? 0}</span>
        ) : null}
      </DropdownMenuCheckboxItem>
    );
  });
}

// A toolbar filter: one button per facet ("Genre", "Language"), its menu a
// scrolling checklist of the facet's values that stays open while toggling.
// The button shows how many are picked (a single-pick one, which).
export function FacetMenu({ facet }: { facet: Facet }) {
  if (facet.values.length === 0) return null;
  // A single-pick facet names its pick ("Group: FuN"; just "FuN" without a
  // label, when the row beside it already says what it is) and needs no count.
  const active = facet.single ? 0 : activeIn(facet);
  const picked = facet.single ? [...facet.selected][0] : undefined;
  const format = facet.format ?? ((v: string) => v);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline" }),
          "shrink-0",
          (active > 0 || (facet.single && facet.changed)) && "border-primary/50 bg-primary/10 text-foreground",
        )}
      >
        {picked !== undefined ? (
          <span>
            {facet.label ? <span className="text-muted-foreground">{facet.label}: </span> : null}
            {format(picked)}
          </span>
        ) : (
          facet.label
        )}
        {active > 0 ? <CountPill n={active} /> : null}
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(28rem,var(--available-height))] w-auto min-w-56">
        <FacetOptions facet={facet} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type FilterChip = { id: string; label: string; onRemove: () => void };

// The active selections of the toolbar's FacetMenus as removable chips, plus
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
