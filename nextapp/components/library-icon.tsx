import { HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";

// What the library has already: a disk in peach, no tooltip (what it has is said beside it).
export function LibraryIcon({ className }: { className?: string }) {
  return <HardDrive className={cn("size-3.5 shrink-0 text-warning", className)} aria-label="In library" />;
}
