import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Every page's tables (Upgrades, Downloads, Settings, a title's releases
// and the rest), so they all look alike: a header row, rows that light up on hover. One column
// stretches (and truncates) — the first, unless another says stretch —
// every other one is only as wide as its widest value. hidden: a column
// without a visible header (an action), named for screen readers only.
// width: a fixed width (a w-* class), so tables stacked on one page line
// up; then the table lays out fixed and the stretched column takes the rest
// (at least 48rem wide in all, so on a phone it scrolls rather than
// squeezing that column to nothing). phone: false drops a column below sm
// (its rows fold it into the title cell); then the table fits a phone
// instead of scrolling.
export type Column = {
  label: string;
  align?: "right";
  hidden?: boolean;
  stretch?: boolean;
  width?: string;
  phone?: false;
};

// A cell of a phone: false column.
export const NOT_ON_PHONE = "max-sm:hidden";

export const CELL = "px-3 py-2 whitespace-nowrap";
export const MUTED_CELL = cn(CELL, "text-muted-foreground");
export const NUMBER_CELL = cn(CELL, "text-right font-num text-muted-foreground tabular-nums");
// The stretched first cell: max-w-0 lets it truncate instead of growing.
export const TITLE_CELL = cn(CELL, "max-w-0 truncate");
// A row's ⋯ menu: from sm up in a column of its own at the row's end,
// centered like the other cells (MENU_CELL, a phone: false column); on a
// phone at the right end of the title's first line (PHONE_MENU around it),
// so the lines under the title take the whole width.
export const MENU_CELL = cn(CELL, "py-0 text-right", NOT_ON_PHONE);
export const PHONE_MENU = "-my-1 shrink-0 self-center sm:hidden";
// h-9: every table's rows the same height, buttons or not.
export const ROW = "h-9 border-t border-border/70 transition-colors hover:bg-muted/40";

// flat: inside a framed area (Settings' sections): no frame or head fill of
// its own, edge to edge with the area.
export function DataTable({ columns, children, flat }: { columns: Column[]; children: ReactNode; flat?: boolean }) {
  const stretched = Math.max(
    0,
    columns.findIndex((c) => c.stretch),
  );
  const fixed = columns.some((c) => c.width);
  const fits = columns.some((c) => c.phone === false);
  return (
    // relative: a hidden column's sr-only header is absolute; without it,
    // it would widen the page by what the table scrolls.
    <div className={cn("relative overflow-x-auto", flat ? "-mx-3" : "rounded-lg border bg-table")}>
      <table
        className={cn(
          "w-full border-collapse text-sm",
          fixed ? "table-fixed" : "",
          fixed ? (fits ? "sm:min-w-[48rem]" : "min-w-[48rem]") : fits ? "sm:min-w-[40rem]" : "min-w-[40rem]",
        )}
      >
        {/* Not on a phone: there each row folds its values under the title,
            so the column names say nothing. Squeezed to nothing rather than
            hidden, since a fixed table takes its column widths from it. */}
        <thead className="max-sm:[&_th]:h-0 max-sm:[&_th]:py-0 max-sm:[&_th]:text-[0px] max-sm:[&_th]:leading-[0]">
          <tr className={cn("text-left text-xs text-muted-foreground", !flat && "bg-card")}>
            {columns.map((c, i) => (
              <th
                key={c.label}
                className={cn(
                  CELL,
                  "font-medium",
                  i === stretched && !fixed && "w-full",
                  c.width,
                  c.align === "right" && "text-right",
                  c.phone === false && NOT_ON_PHONE,
                )}
              >
                {c.hidden ? <span className="sr-only">{c.label}</span> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        {/* Headless on a phone, a framed table's first row would draw its
            line against the frame. */}
        <tbody className={cn(!flat && "max-sm:[&>tr:first-child]:border-t-0")}>{children}</tbody>
      </table>
    </div>
  );
}
