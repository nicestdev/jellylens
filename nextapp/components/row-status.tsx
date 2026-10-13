import type { ReactNode } from "react";
import { Bar } from "@/components/progress-bar";
import { MUTED_CELL, NOT_ON_PHONE } from "@/components/library-table";
import { cn, titleIfCut } from "@/lib/utils";
import { shown } from "@/components/dot";

// Where a Downloads or Organize row is at, in its Status column and on a
// phone under its title: while it moves a bar over a line that starts with
// the state ("Loading · 45 MB/s · 3 min") and the share done on the right;
// otherwise the line alone, red for an error, peach for something still
// open (parts the hoster didn't answer for), or colored itself (Organize's
// "−1 +1"). An error wraps; anything else cut off has its whole text on
// hover (only then: no tooltips otherwise). line: one piece, or values
// shown with Dots.
export type RowState = {
  line: ReactNode | ReactNode[];
  tone?: "error" | "warning";
  bar?: { fraction: number; color: string };
};

function Body({ state, right }: { state: RowState; right?: string }) {
  const line = (
    <span
      onMouseEnter={titleIfCut}
      className={cn(
        "min-w-0 flex-1",
        // An error wraps: its reason is what to read.
        state.tone === "error" ? "[overflow-wrap:anywhere] whitespace-normal text-destructive" : "truncate",
        state.tone === "warning" && "text-warning",
      )}
    >
      {shown(state.line)}
    </span>
  );
  if (!state.bar)
    return (
      <span className="flex min-w-0 items-baseline gap-2">
        {line}
        {right ? <span className="shrink-0">{right}</span> : null}
      </span>
    );
  return (
    <>
      <Bar fraction={state.bar.fraction} color={state.bar.color} className="mt-1 h-1.5" />
      <span className="mt-1.5 flex items-baseline gap-2 tabular-nums">
        {line}
        <span className="shrink-0">{`${Math.floor(state.bar.fraction * 100)}\u202f%`}</span>
      </span>
    </>
  );
}

// The Status column (not on a phone).
export function StatusCell({ state }: { state: RowState }) {
  return (
    <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>
      <Body state={state} />
    </td>
  );
}

// On a phone, under the title (right: after a line without a bar, the size;
// a "—" left out there, the size alone says enough).
export function PhoneStatus({ state, right, className }: { state: RowState; right?: string; className?: string }) {
  return (
    <div className={cn("mt-1 text-xs text-muted-foreground sm:hidden", className)}>
      <Body state={state.line === "—" ? { ...state, line: "" } : state} right={right} />
    </div>
  );
}
