import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// A number with what it is and a hint (Analytics, Missing). With onClick
// it's a button that picks what's shown below (active: picked). muted: a
// zero, nothing to see.
export function StatTile({
  label,
  value,
  hint,
  loading,
  muted,
  active,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  loading?: boolean;
  muted?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-7 w-20" />
          <Skeleton className="mt-1.5 h-3 w-16" />
        </>
      ) : (
        <>
          <div className={cn("mt-1 text-2xl font-semibold tracking-tight", muted && "text-muted-foreground")}>{value}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        </>
      )}
    </>
  );
  if (!onClick) return <div className="rounded-xl border bg-card p-4">{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={Boolean(active)}
      className={cn(
        "rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-primary/60 ring-1 ring-primary/40 hover:border-primary/60"
      )}
    >
      {body}
    </button>
  );
}
