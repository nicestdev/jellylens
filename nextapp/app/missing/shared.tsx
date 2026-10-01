"use client";

import { Skeleton } from "@/components/ui/skeleton";

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

// A card while loading: a show's, or with collection a collection's (a
// row of its own, the bigger poster and a strip of its movies').
export function CardSkeleton({ collection }: { collection?: boolean }) {
  return (
    <div className="flex gap-4 rounded-xl border bg-card p-4">
      <Skeleton className={collection ? "aspect-2/3 w-28" : "aspect-2/3 w-20"} />
      <div className="flex-1 space-y-2 pt-1">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-24" />
        {collection ? (
          <div className="flex gap-3 pt-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-2/3 w-24" />
            ))}
          </div>
        ) : (
          <Skeleton className="mt-4 h-5 w-full max-w-md" />
        )}
      </div>
    </div>
  );
}
