import { Library } from "lucide-react";
import { cn } from "@/lib/utils";

// What the library has of a release, after its name (a title's releases,
// Downloads): peach when a file is from this very release, muted when
// it's only the same title (or season) in another one. The tooltip says
// what you have.
export function InLibraryIcon({ label, hint, exact }: { label: string; hint: string; exact: boolean }) {
  return (
    <span
      title={[label, hint].filter(Boolean).join("\n")}
      className={cn("shrink-0 self-center", exact ? "text-warning" : "text-muted-foreground")}
    >
      <Library className="size-3.5" aria-label={label} />
    </span>
  );
}
