import type { LucideIcon } from "lucide-react";

// The dashed "nothing to show" box. The icon stays muted even for a good
// kind of empty (nothing missing) — color is kept for actual findings.
export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-14 text-center">
      <Icon className="size-6 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
