import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { type Column, DataTable } from "@/components/library-table";
import { cn } from "@/lib/utils";
import { Dot, shown } from "@/components/dot";

// A page section as a dark framed area (Settings, Analytics): its heading
// inside, an action on the right of it, its table or list edge to edge
// (DataTable flat, or -mx-3 for a list or an AddRow), without a line on top
// of the first. count: how many it holds, after the title and lighter
// ("Running · 2").
export function SectionFrame({
  title,
  count,
  action,
  children,
  className,
}: {
  title: string;
  count?: ReactNode | ReactNode[];
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("min-w-0 overflow-hidden rounded-lg border bg-card", className)}>
      <div className="flex min-h-9 items-center gap-4 border-b px-3">
        <h2 className="min-w-0 flex-1 truncate font-mono text-sm font-medium">
          {title}
          {count !== undefined ? (
            <span className="text-[0.8125rem] font-normal text-muted-foreground">
              {" "}
              <Dot /> {shown(count, true)}
            </span>
          ) : null}
        </h2>
        {action}
      </div>
      <div className="px-3 [&>*:first-child]:border-t-0">{children}</div>
    </section>
  );
}

// A list's rows (Settings' Options, Environment) inside a SectionFrame: edge
// to edge, a line on top and between them, like a table's.
export const FRAME_LIST = "-mx-3 divide-y divide-row border-t border-row";

// A table as a framed area (Downloads, a title's releases and the
// rest): one header row, the section's heading with its count lighter in
// place of the first column's name ("Running · 2"), the other columns'
// names beside it. footer: under the table, edge to edge (an AddRow).
// open: the heading folds the rows away and back (a chevron after it),
// onToggle on a click; folded, the other columns' names go too, only the
// heading is left.
export function TableFrame({
  title,
  count,
  columns,
  minWidth,
  busy,
  footer,
  open,
  onToggle,
  children,
  className,
}: {
  title: string;
  count?: ReactNode | ReactNode[];
  columns: Column[];
  minWidth?: string;
  busy?: boolean;
  footer?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [first, ...rest] = columns;
  const label = (
    <>
      <span className="text-sm">{title}</span>
      {count !== undefined ? (
        <span className="text-[0.8125rem] font-normal text-muted-foreground">
          {" "}
          <Dot /> {shown(count, true)}
        </span>
      ) : null}
    </>
  );
  const heading = onToggle ? (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="inline-flex cursor-pointer items-center gap-1 text-foreground outline-none"
    >
      {label}
      <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
    </button>
  ) : (
    <span className="text-foreground">{label}</span>
  );
  return (
    <section
      aria-label={title}
      aria-busy={busy}
      className={cn("min-w-0 overflow-hidden rounded-lg border bg-card px-3", className)}
    >
      <DataTable
        flat
        minWidth={minWidth}
        columns={[{ ...first, label: heading }, ...rest.map((c) => (open === false ? { ...c, label: "" } : c))]}
      >
        {open === false ? null : children}
      </DataTable>
      {footer ? <div className="-mx-3">{footer}</div> : null}
    </section>
  );
}
