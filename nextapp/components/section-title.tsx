import type { ReactNode } from "react";
import { formatNumber } from "@/lib/format";

// A page section's heading (Missing, Settings, Downloads): its name, a
// muted count badge when it has one, a hint, and on the right what acts on the whole section.
export function SectionTitle({
  children,
  count,
  hint,
  action,
}: {
  children: ReactNode;
  count?: number;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex min-h-5 items-center gap-4">
      <h2 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold">
        {children}
        {count ? (
          <span className="rounded bg-muted px-1.5 py-px font-num text-[11px] text-muted-foreground tabular-nums">
            {formatNumber(count)}
          </span>
        ) : null}
        {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </h2>
      {action}
    </div>
  );
}
