import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// A number with what it is and a hint (Analytics, Upgrades, Downloads).
// muted: a zero, nothing to see.
export function StatTile({
  label,
  value,
  hint,
  loading,
  muted,
}: {
  label: string;
  value: string;
  hint: string;
  loading?: boolean;
  muted?: boolean;
}) {
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      {loading ? (
        <>
          <Skeleton className="mt-1.5 h-6 w-20" />
          <Skeleton className="mt-1.5 h-3 w-16" />
        </>
      ) : (
        <>
          <div className={cn("mt-1 font-num text-[22px] leading-tight tabular-nums", muted && "text-muted-foreground")}>
            {value}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        </>
      )}
    </>
  );
  return <div className="rounded-lg border bg-card px-3.5 py-3">{body}</div>;
}
