import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Dots } from "@/components/dot";

// A number with what it is and a hint, if any (Analytics, the Queue,
// Settings' Sync). muted: a zero, nothing to see. action: a small button
// at the top right, beside the label (a stage's Sync). compact: a mini card
// when it's narrower than 13rem (where a hint would wrap): tighter, without
// its hint (Analytics').
export function StatTile({
  label,
  value,
  hint,
  action,
  loading,
  muted,
  compact,
}: {
  label: string;
  value: string;
  hint?: string[];
  action?: ReactNode;
  loading?: boolean;
  muted?: boolean;
  compact?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        {action ? <div className="-my-1.5 -mr-1.5">{action}</div> : null}
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-1.5 h-6 w-20" />
          {hint ? <Skeleton className={cn("mt-1.5 h-3 w-16", compact && "@max-[13rem]:hidden")} /> : null}
        </>
      ) : (
        <>
          <div
            className={cn("mt-1 text-xl leading-tight whitespace-nowrap sm:text-2xl", muted && "text-muted-foreground")}
          >
            {value}
          </div>
          {hint ? (
            <div className={cn("mt-0.5 text-xs text-muted-foreground", compact && "@max-[13rem]:hidden")}>
              <Dots parts={hint} />
            </div>
          ) : null}
        </>
      )}
    </>
  );
  const card = (
    <div className={cn("rounded-lg border bg-card px-3.5 py-3", compact && "@max-[13rem]:px-3 @max-[13rem]:py-2.5")}>
      {body}
    </div>
  );
  // Its own width is what the mini card goes by.
  return compact ? <div className="@container">{card}</div> : card;
}
