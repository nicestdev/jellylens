"use client";

import type { FormEvent, InputHTMLAttributes } from "react";
import { Loader2, Plus } from "lucide-react";

// A section's last line for adding to its list (release groups, archive
// passwords): a row like the list's own, edge to edge, with a borderless
// field and Add as a text button, the accent once there's something to add.
// Enter adds too.
export function AddRow({
  value,
  onChange,
  onSubmit,
  label,
  adding,
  disabled,
  ...input
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  label: string;
  adding: boolean;
  disabled?: boolean;
} & Pick<InputHTMLAttributes<HTMLInputElement>, "autoComplete" | "spellCheck">) {
  return (
    <form
      onSubmit={onSubmit}
      className="-mx-3 -mb-3 flex h-9 items-center gap-2 border-t px-3 text-[13px] transition-colors focus-within:bg-muted/40"
    >
      {adding ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Plus className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <input
        {...input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        disabled={adding || disabled}
        className="min-w-0 flex-1 bg-transparent outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={adding || disabled || !value.trim()}
        className="shrink-0 text-primary transition-colors hover:text-foreground disabled:text-muted-foreground"
      >
        Add
      </button>
    </form>
  );
}
