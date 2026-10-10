"use client";

import type { FormEvent, InputHTMLAttributes } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

// A section's last line for adding to its list (release groups, archive
// passwords): a row like the list's own, edge to edge, with a borderless
// field and Add as a small outline button, usable once there's something to
// add. Enter adds too.
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
      className="-mx-3 -mb-3 flex h-9 items-center gap-2 border-t px-3 text-sm transition-colors focus-within:bg-muted/40"
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
      <Button type="submit" variant="outline" size="xs" disabled={adding || disabled || !value.trim()}>
        Add
      </Button>
    </form>
  );
}
