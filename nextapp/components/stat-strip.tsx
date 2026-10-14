"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type Stat = { label: string; value: string; hint?: string; muted?: boolean };

// How many columns n stats get when `max` would fit a row: as many as fit,
// but the rows evenly filled (4 are 4, or 2 and 2, never 3 and 1).
export function columnsFor(n: number, max: number): number {
  const fit = Math.max(1, Math.min(n, max));
  return Math.ceil(n / Math.ceil(n / fit));
}

// Narrowest a stat gets and the space between them, in px: in the one card
// of a phone, and as a card of its own.
const SIZES = { strip: { min: 104, gap: 32 }, card: { min: 144, gap: 24 } };

// Stats, each its label over its value (the Queue's numbers). On a phone one
// card for all of them across the whole width, wrapping by itself (so a few
// more stats cost one line, not a card each); from sm up a card each (like
// Analytics'), a hint under the value there, a mini card without it when it's
// narrower than 13rem. The columns follow the width, the rows always evenly
// filled (columnsFor). A single one fills the width. muted: nothing
// to see ("—"). loading: the values aren't there yet.
export function StatStrip({ stats, loading }: { stats: Stat[]; loading?: boolean }) {
  const n = stats.length;
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(n);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || n < 2) return;
    const measure = () => {
      // Cards have a border of their own, the stats in the strip don't.
      const card = parseFloat(getComputedStyle(el.firstElementChild!.firstElementChild!).borderTopWidth) > 0;
      const { min, gap } = SIZES[card ? "card" : "strip"];
      const inner = el.clientWidth - (card ? 0 : parseFloat(getComputedStyle(el).paddingLeft) * 2);
      setColumns(columnsFor(n, Math.floor((inner + gap) / (min + gap))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [n]);
  return (
    <div
      ref={ref}
      style={n > 1 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      className={cn(
        "gap-x-8 gap-y-3 sm:gap-6 max-sm:rounded-lg max-sm:border max-sm:bg-card max-sm:px-4 max-sm:py-3",
        n > 1 && "grid",
      )}
    >
      {stats.map((s) => (
        <div key={s.label} className="@container min-w-0">
          <div className="sm:rounded-lg sm:border sm:bg-card sm:px-3.5 sm:py-3 sm:@max-[13rem]:px-3 sm:@max-[13rem]:py-2.5">
            <div className="truncate text-sm font-medium text-muted-foreground">{s.label}</div>
            {loading ? (
              <Skeleton className="mt-1.5 h-6 w-20" />
            ) : (
              <div
                className={cn(
                  "mt-0.5 text-xl leading-tight whitespace-nowrap sm:mt-1 sm:text-2xl",
                  s.muted && "text-muted-foreground",
                )}
              >
                {s.value}
              </div>
            )}
            {s.hint ? (
              <div className="mt-0.5 text-xs text-muted-foreground @max-[13rem]:hidden max-sm:hidden">{s.hint}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
