"use client";

import { Check, X } from "lucide-react";
import { ChevronDownIcon } from "@/components/design-icons";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// One multi-select facet (Status, Genre, Language, …) of a toolbar.
// single: one value always picked, like a radio group; onToggle picks it.
export type Facet = {
  key: string;
  label: string;
  values: string[];
  counts?: Map<string, number>; // how many items each value matches, if known
  selected: Set<string>;
  onToggle: (value: string) => void;
  format?: (value: string) => string;
  single?: boolean;
};

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

// The design's toolbar button: outline, muted, the same whatever it filters.
export const TOOLBAR_BUTTON =
  "h-9 shrink-0 gap-1.5 rounded-lg border border-input bg-transparent pr-2.5 pl-3 text-sm font-normal text-sub-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted max-sm:h-10";

// A toolbar filter: one button per facet ("Genre: All"), its menu a
// scrolling checklist of the facet's values that stays open while toggling.
// The button names what's picked ("Genre: Sci-Fi", "Genre: Sci-Fi +1");
// a multi-pick menu ends with Clear.
export function FacetMenu({ facet, className }: { facet: Facet; className?: string }) {
  if (facet.values.length === 0) return null;
  const format = facet.format ?? ((v: string) => v);
  const picked = [...facet.selected];
  const value = picked.length ? format(picked[0]) + (picked.length > 1 ? ` +${picked.length - 1}` : "") : "All";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-facet
        data-picked={picked.length ? "" : undefined}
        className={cn(buttonVariants({ variant: "ghost" }), TOOLBAR_BUTTON, className)}
      >
        <span className="max-w-60 truncate">
          {facet.label ? <span data-facet-label>{facet.label}: </span> : null}
          <span className="font-semibold max-sm:text-foreground">{value}</span>
        </span>
        <ChevronDownIcon className="size-3.5" strokeWidth={1.8} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(28rem,var(--available-height))] w-auto min-w-56">
        <FacetOptions facet={facet} />
        {!facet.single && picked.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => picked.forEach((v) => facet.onToggle(v))}>
              <X />
              Clear
            </DropdownMenuItem>
          </>
        ) : null}
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
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          aria-label={`Remove ${chip.label}`}
          onClick={chip.onRemove}
          // Like a toolbar button (TOOLBAR_BUTTON), smaller: as dark as the
          // rest of the row.
          className="flex h-6 cursor-pointer items-center gap-1 rounded-md border border-input bg-transparent pr-1.5 pl-2 text-[0.8125rem] text-sub-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {chip.label}
          <X className="size-3 text-muted-foreground" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 cursor-pointer text-[0.8125rem] text-sub-foreground transition-colors hover:text-bright"
      >
        Clear all
      </button>
    </div>
  );
}
