import { Bar } from "@/components/progress-bar";
import { MUTED_CELL, NOT_ON_PHONE } from "@/components/library-table";
import { cn } from "@/lib/utils";

// Where a Downloads or Organize row is at, in its Status column and on a
// phone under its title: while it moves a bar over a line that starts with
// the state ("Loading · 45 MB/s · 3 min") and the share done on the right;
// otherwise the line alone, red for an error, peach for something still
// open (parts the hoster didn't answer for). hint: on hover (an error's
// whole text).
export type RowState = {
  line: string;
  hint?: string;
  tone?: "error" | "warning";
  bar?: { fraction: number; color: string };
};

function Body({ state, right }: { state: RowState; right?: string }) {
  const line = (
    <span
      title={state.hint}
      className={cn(
        "min-w-0 flex-1 truncate",
        state.tone === "error" && "text-destructive",
        state.tone === "warning" && "text-warning",
      )}
    >
      {state.line}
    </span>
  );
  if (!state.bar)
    return (
      <span className="flex min-w-0 items-baseline gap-2">
        {line}
        {right ? <span className="shrink-0 font-num text-xs tabular-nums">{right}</span> : null}
      </span>
    );
  return (
    <>
      <Bar fraction={state.bar.fraction} color={state.bar.color} className="mt-1 h-1.5" />
      <span className="mt-1.5 flex items-baseline gap-2 text-xs tabular-nums">
        {line}
        <span className="shrink-0 font-num">{Math.floor(state.bar.fraction * 100)}%</span>
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

// On a phone, under the title (right: after a line without a bar, the size).
export function PhoneStatus({ state, right, className }: { state: RowState; right?: string; className?: string }) {
  return (
    <div className={cn("mt-1 text-xs text-muted-foreground sm:hidden", className)}>
      <Body state={state} right={right} />
    </div>
  );
}
