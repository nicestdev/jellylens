import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Dots } from "@/components/dot";

// A number with what it is and a hint, if any (Analytics, the Queue,
// Settings' Sync). muted: a zero, nothing to see. action: a small button
// at the top right, beside the label (a stage's Sync).
export function StatTile({
  label,
  value,
  hint,
  action,
  loading,
  muted,
}: {
  label: string;
  value: string;
  hint?: string[];
  action?: ReactNode;
  loading?: boolean;
  muted?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        {action ? <div className="-my-1.5 -mr-1.5">{action}</div> : null}
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-1.5 h-6 w-20" />
          {hint ? <Skeleton className="mt-1.5 h-3 w-16" /> : null}
        </>
      ) : (
        <>
          <div
            className={cn(
              "mt-1 font-mono text-xl leading-tight whitespace-nowrap sm:text-2xl",
              muted && "text-muted-foreground",
            )}
          >
            {value}
          </div>
          {hint ? (
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">
              <Dots parts={hint} spaced />
            </div>
          ) : null}
        </>
      )}
    </>
  );
  return <div className="rounded-lg border bg-card px-3.5 py-3">{body}</div>;
}
