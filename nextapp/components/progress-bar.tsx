import { cn } from "@/lib/utils";

// A progress bar: a muted track filled to fraction (Downloads, Organize).
export function Bar({ fraction, color, className }: { fraction: number; color: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700", color)}
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}
