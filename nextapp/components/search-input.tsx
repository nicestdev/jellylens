"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { SearchIcon } from "@/components/design-icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// The toolbar search box (Movies, Shows, Requests). A × appears once
// there's text; it clears the box and keeps focus there for the next query.
// Escape clears it too. size "lg" is a page's own search, beside
// its filters and as tall as their buttons, as dark as they are.
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  size = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string; // width, e.g. "w-full sm:w-64"
  size?: "default" | "lg";
}) {
  const ref = useRef<HTMLInputElement>(null);
  const lg = size === "lg";
  return (
    <div className={cn("relative", lg && "w-full sm:w-80", className)}>
      <SearchIcon
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
          lg ? "left-3.5 size-[1.125rem]" : "left-2.5 size-4",
        )}
      />
      <Input
        ref={ref}
        // No browser suggestions from earlier entries, no spell check on titles.
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) onChange("");
        }}
        className={cn(
          lg
            ? "h-9 rounded-lg border-input bg-transparent pr-3.5 pl-[2.625rem] md:text-sm dark:bg-transparent max-sm:h-11"
            : "h-8 pl-8",
          value && (lg ? "pr-10" : "pr-8"),
          // A quiet focus: the border a step lighter, no ring around it.
          "focus-visible:border-foreground/30 focus-visible:ring-0",
        )}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          className={cn(
            "absolute top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            lg ? "right-3" : "right-1.5",
          )}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
