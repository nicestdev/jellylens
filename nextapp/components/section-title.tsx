import type { ReactNode } from "react";

// A page section's heading (Missing, Settings, Downloads, Organize): its
// name, a hint, and on the right what acts on the whole section.
export function SectionTitle({
  children,
  hint,
  action,
}: {
  children: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex min-h-5 items-center gap-4">
      <h2 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold">
        {children}
        {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </h2>
      {action}
    </div>
  );
}
