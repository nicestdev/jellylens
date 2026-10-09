"use client";

import { FacetMenu } from "@/components/filter-menu";

// How many files come in at once, a single-pick menu like Upgrades'.
// No label: the Settings row beside it names it ("2 files").
export function SlotsMenu({
  slots,
  maxSlots,
  onChange,
}: {
  slots: number;
  maxSlots: number;
  onChange: (slots: number) => void;
}) {
  const values = Array.from({ length: maxSlots }, (_, i) => String(i + 1));
  return (
    <FacetMenu
      facet={{
        key: "slots",
        label: "",
        values,
        selected: new Set([String(slots)]),
        onToggle: (v) => onChange(Number(v)),
        format: (v) => (v === "1" ? "1 file" : `${v} files`),
        single: true,
      }}
    />
  );
}
