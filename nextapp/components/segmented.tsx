"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Segment<K extends string> = { key: K; label: ReactNode };

// A row of joined buttons, one of them picked (List | Grid, Movies |
// TV Shows). h-7, square-ish; full width with equal parts when the caller
// stretches it (phones).
export function Segmented<K extends string>({
  segments,
  value,
  onChange,
  label,
  className,
}: {
  segments: Segment<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string; // the group's name for screen readers
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex h-7 overflow-hidden rounded-md border text-[13px]", className)}
    >
      {segments.map((s) => (
        <button
          key={s.key}
          type="button"
          aria-pressed={value === s.key}
          onClick={() => onChange(s.key)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 px-2.5 whitespace-nowrap transition-colors",
            value === s.key ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
