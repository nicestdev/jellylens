"use client";

import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Shared by the TV Shows and Movies tabs of the Missing page.

export type Tone = "destructive" | "warning" | "info";
export const TONES: Record<Tone, { badge: string; tile: string; ring: string }> = {
  destructive: {
    badge: "bg-destructive/15 text-destructive",
    tile: "bg-destructive/15 text-destructive ring-destructive/40",
    ring: "ring-2 ring-destructive/70",
  },
  warning: { badge: "bg-warning/15 text-warning", tile: "bg-warning/15 text-warning ring-warning/40", ring: "ring-2 ring-warning/70" },
  info: { badge: "bg-info/15 text-info", tile: "bg-info/15 text-info ring-info/40", ring: "ring-2 ring-info/70" },
};

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// A clickable summary card: count of findings (unit) across how many
// groups (shows, collections) — picking it shows that category below.
export function StatCard({
  label,
  icon: Icon,
  tone,
  unit,
  groupUnit,
  count,
  groups,
  detail,
  active,
  loading,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  tone: Tone;
  unit: string;
  groupUnit: string;
  count: number;
  groups: number;
  detail?: string; // extra note after "in N shows"
  active: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const empty = !loading && count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-primary/60 ring-1 ring-primary/40 hover:border-primary/60"
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            empty ? "bg-muted text-muted-foreground" : TONES[tone].badge
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="text-sm leading-tight font-medium">{label}</span>
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-4 h-7 w-24" />
          <Skeleton className="mt-1.5 h-3 w-16" />
        </>
      ) : (
        <>
          <div className="mt-4 flex items-baseline gap-1.5">
            <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", empty && "text-muted-foreground")}>
              {count}
            </span>
            <span className="text-sm text-muted-foreground">{count === 1 ? unit : `${unit}s`}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{empty ? "Nothing to do" : [`in ${plural(groups, groupUnit)}`, detail].filter(Boolean).join(" · ")}</div>
        </>
      )}
    </button>
  );
}

export function CardSkeleton() {
  return (
    <div className="flex gap-4 rounded-xl border bg-card p-4">
      <Skeleton className="aspect-2/3 w-20" />
      <div className="flex-1 space-y-2 pt-1">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-5 w-full max-w-md" />
      </div>
    </div>
  );
}
