"use client";

import { useEffect, useRef, type FormEvent, type InputHTMLAttributes } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CELL, ROW, TITLE_CELL } from "@/components/library-table";
import { cn } from "@/lib/utils";

// Adding to a section's list (release groups, archive passwords): a + in the
// heading's last column, right above the rows' ⋯, opens an AddRow.
export function AddButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="text-right">
      <Button
        variant="ghost"
        size="icon-xs"
        className="align-middle text-muted-foreground"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        <Plus />
      </Button>
    </div>
  );
}

// The list's last row while adding: a borderless field where the names
// start, focused, a spinner where the ⋯ are while it's added. Enter adds and
// leaves it open for the next; Esc, or leaving it empty, closes it.
export function AddRow({
  value,
  onChange,
  onSubmit,
  onClose,
  placeholder,
  columns,
  adding,
  className,
  ...input
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  placeholder: string;
  columns: number;
  adding: boolean;
  // The field's text, as the list's names are.
  className?: string;
} & Pick<InputHTMLAttributes<HTMLInputElement>, "autoComplete" | "spellCheck">) {
  const field = useRef<HTMLInputElement>(null);
  // Back in the field once it's added (disabled meanwhile, it lost focus).
  useEffect(() => {
    if (!adding) field.current?.focus();
  }, [adding]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (value.trim()) onSubmit();
  }

  return (
    <tr className={cn(ROW, "focus-within:bg-muted/40")}>
      <td className={TITLE_CELL} colSpan={columns - 1}>
        <form onSubmit={submit}>
          <input
            {...input}
            ref={field}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            onBlur={() => !value.trim() && !adding && onClose()}
            placeholder={placeholder}
            aria-label={placeholder}
            disabled={adding}
            className={cn(
              "w-full bg-transparent outline-none placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-muted-foreground disabled:opacity-60",
              className,
            )}
          />
        </form>
      </td>
      <td className={cn(CELL, "py-0 text-right")}>
        {adding ? <Loader2 className="inline size-3.5 animate-spin align-middle text-muted-foreground" /> : null}
      </td>
    </tr>
  );
}
