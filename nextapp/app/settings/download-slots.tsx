"use client";

import { ChevronDownIcon } from "@/components/design-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { plural } from "@/lib/format";

// How many files come in at once, a single-pick menu.
// No label: the Settings row beside it names it ("2 files"). The trigger
// reads like the row's value, not a toolbar button, so the Options rows
// stay as quiet as the switch above; its menu opens under it, to the left.
export function SlotsMenu({
  slots,
  maxSlots,
  onChange,
}: {
  slots: number;
  maxSlots: number;
  onChange: (slots: number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Parallel downloads: ${plural(slots, "file")}`}
        className="-mr-1.5 flex h-7 cursor-pointer items-center gap-1 rounded-md pr-1.5 pl-2 text-[0.8125rem] tabular-nums transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted"
      >
        {plural(slots, "file")}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" strokeWidth={1.8} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-28">
        <DropdownMenuRadioGroup value={String(slots)} onValueChange={(v) => onChange(Number(v))}>
          {Array.from({ length: maxSlots }, (_, i) => (
            <DropdownMenuRadioItem key={i} value={String(i + 1)} className="tabular-nums">
              {plural(i + 1, "file")}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
