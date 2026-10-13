import type { CSSProperties, ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Every page's tables (Downloads, Settings, a title's releases
// and the rest), so they all look alike: a header row, rows that light up on hover. One column
// stretches (and truncates) — the first, unless another says stretch —
// every other one is only as wide as its widest value. hidden: a column
// without a visible header (an action), named for screen readers only.
// width: a fixed width (a w-* class), so tables stacked on one page line
// up; then the table lays out fixed and the stretched column takes the rest
// (at least 48rem wide in all, so on a phone it scrolls rather than
// squeezing that column to nothing). phone: false drops a column below sm
// (its rows fold it into the title cell); then the table fits a phone
// instead of scrolling. style: a width worked out from the rows (inline,
// as a class can't be made up at runtime).
// label: a string, or (a section's heading in the first column) any
// content, "Running · 4 · 30.6 MB/s" with its last part lighter.
export type Column = {
  label: ReactNode;
  align?: "right" | "center";
  hidden?: boolean;
  stretch?: boolean;
  width?: string;
  style?: CSSProperties;
  phone?: false;
};

// A cell of a phone: false column.
export const NOT_ON_PHONE = "max-sm:hidden";

// 12px a side.
export const CELL = "px-3 py-2 whitespace-nowrap";
export const MUTED_CELL = cn(CELL, "text-muted-foreground");
export const NUMBER_CELL = cn(CELL, "text-right text-sub-foreground tabular-nums");
// The stretched first cell: max-w-0 lets it truncate instead of growing.
export const TITLE_CELL = cn(CELL, "max-w-0 truncate");
// A row's ⋯ menu: from sm up in a column of its own at the row's end,
// centered like the other cells (MENU_CELL, a phone: false column); on a
// phone at the right end of the title's first line (PHONE_MENU around it),
// so the lines under the title take the whole width.
export const MENU_CELL = cn(CELL, "py-0 text-right", NOT_ON_PHONE);
export const PHONE_MENU = "-my-1 shrink-0 self-center sm:hidden";
// A row's ⋯ (or another icon) button, muted until hovered.
export const iconButton = cn(buttonVariants({ variant: "ghost", size: "icon-sm", className: "text-muted-foreground" }));
// h-9: every table's rows the same height, buttons or not.
export const ROW = "h-9 border-t border-row transition-colors hover:bg-muted/40";

// flat: inside a framed area (Settings' sections): no frame or head fill of
// its own, edge to edge with the area.
// minWidth: the width under which it scrolls (the design's per table), in
// place of the default.
export function DataTable({
  columns,
  children,
  flat,
  minWidth,
}: {
  columns: Column[];
  children: ReactNode;
  flat?: boolean;
  minWidth?: string;
}) {
  const stretched = Math.max(
    0,
    columns.findIndex((c) => c.stretch),
  );
  const fixed = columns.some((c) => c.width || c.style);
  const fits = columns.some((c) => c.phone === false);
  return (
    // relative: a hidden column's sr-only header is absolute; without it,
    // it would widen the page by what the table scrolls.
    <div className={cn("relative overflow-x-auto overflow-y-hidden", flat ? "-mx-3" : "rounded-lg border bg-table")}>
      <table
        className={cn(
          "w-full border-collapse text-sm",
          fixed ? "table-fixed" : "",
          minWidth ??
            (fixed ? (fits ? "sm:min-w-[48rem]" : "min-w-[48rem]") : fits ? "sm:min-w-[40rem]" : "min-w-[40rem]"),
        )}
      >
        {/* On a phone only the first: there each row folds its values under
            the title, so the other column names say nothing. Squeezed to
            nothing rather than hidden, since a fixed table takes its column
            widths from it. The first is the section's heading ("Needs attention · 3"). */}
        <thead className="max-sm:[&_th:not(:first-child)]:h-0 max-sm:[&_th:not(:first-child)]:py-0 max-sm:[&_th:not(:first-child)]:text-[0px] max-sm:[&_th:not(:first-child)]:leading-[0]">
          <tr className={cn("h-9 border-b text-left text-sm text-sub-foreground", !flat && "bg-card")}>
            {columns.map((c, i) => (
              <th
                key={i}
                style={c.style}
                className={cn(
                  CELL,
                  "py-0 font-medium",
                  // Too narrow, the stretched column's heading runs on over the
                  // next (on a phone their names are hidden), not widening the table.
                  i === stretched && !fixed && "w-full max-w-0",
                  c.width,
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
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
        <tbody className="[&>tr:first-child]:border-t-0">{children}</tbody>
      </table>
    </div>
  );
}
