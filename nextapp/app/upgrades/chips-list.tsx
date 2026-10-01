"use client";

import { Poster } from "@/components/poster";
import { formatBytes, plural, seasonLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { attributes, formatChange, type Attribute, type SwitchRow } from "./logic";

// The switch list: one row per movie or season, showing only what would
// change.

// A small tag after the chips: a pack, how many episodes or files.
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-muted px-1 py-px text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground">
      {children}
    </span>
  );
}

// Green when it frees space, red when it costs some.
function ChangeText({ bytes }: { bytes: number | null }) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        (bytes === null || bytes === 0) && "text-muted-foreground",
        bytes !== null && bytes < 0 && "text-emerald-400",
        bytes !== null && bytes > 0 && "text-red-400"
      )}
    >
      {formatChange(bytes)}
    </span>
  );
}

const metaOf = (r: SwitchRow) =>
  r.unit.season !== null ? seasonLabel(r.unit.season) : r.unit.year ? String(r.unit.year) : "";

// "w00t → VECTOR" where it changes, "1080p" plain where it doesn't. Audio
// gained is green, lost red.
function AttributeChip({ a }: { a: Attribute }) {
  if (a.same) return <span className="px-1 text-xs text-muted-foreground">{a.after}</span>;
  const gain = a.key === "audio" && a.before !== "DL" && a.before !== "ML";
  const loss = a.key === "audio" && a.after === "DE";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap",
        gain ? "bg-emerald-500/15" : loss ? "bg-red-500/15" : "bg-primary/10"
      )}
    >
      <span className="text-muted-foreground line-through decoration-muted-foreground/40">{a.before}</span>
      <span className="text-muted-foreground">→</span>
      <span className={cn("font-medium", gain && "text-emerald-300", loss && "text-red-300")}>{a.after}</span>
    </span>
  );
}

// The two sizes as bars of one scale, so it shows at a glance which is
// bigger and by how much.
function SizeBars({ before, after }: { before: number; after: number | null }) {
  const max = Math.max(before, after ?? 0) || 1;
  const bar = (bytes: number | null, tone: string) => (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        {bytes !== null ? <div className={cn("h-full rounded-full", tone)} style={{ width: `${(bytes / max) * 100}%` }} /> : null}
      </div>
      <span className="w-16 text-right text-[11px] text-muted-foreground tabular-nums">
        {bytes === null ? "?" : formatBytes(bytes)}
      </span>
    </div>
  );
  return (
    <div className="space-y-1">
      {bar(before, "bg-muted-foreground/50")}
      {bar(after, "bg-primary")}
    </div>
  );
}

// One row per title: poster, title, then only what changes (chips), the
// sizes as bars and the change. The names show on hover; the title opens
// the release panel.
export function ChipsList({ rows, onOpen }: { rows: SwitchRow[]; onOpen: (r: SwitchRow) => void }) {
  return (
    <div className="mt-3 divide-y overflow-hidden rounded-xl border bg-card">
      {rows.map((r) => {
        const extras = [
          r.alt.pack ? "Pack" : r.alt.episodes > 1 ? plural(r.alt.episodes, "episode") : null,
          r.unit.files > 1 ? plural(r.unit.files, "file") : null,
          r.others ? `+${r.others} more` : null,
        ].filter(Boolean);
        return (
          // Phones: poster, then the title with the change beside it and the
          // chips below. From md up one line: title, chips, sizes, change.
          <div key={r.unit.key} className="flex items-start gap-3 px-4 py-3 md:items-center md:gap-4">
            <Poster itemId={r.unit.parentId} tag={r.unit.imageTag ?? undefined} alt="" height={120} className="w-10" />
            <div className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
              <div className="flex items-start justify-between gap-3 md:block md:w-52 md:shrink-0">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpen(r)}
                    className="block max-w-full truncate text-left text-sm font-medium transition-colors hover:text-primary"
                  >
                    {r.unit.title}
                  </button>
                  <div className="truncate text-xs text-muted-foreground">{metaOf(r)}</div>
                </div>
                <div className="shrink-0 text-sm md:hidden">
                  <ChangeText bytes={r.change} />
                </div>
              </div>
              <div
                className="mt-2 flex min-w-0 flex-1 flex-wrap items-center gap-1.5 md:mt-0"
                title={`${r.unit.fileName}\n→ ${r.alt.name}`}
              >
                {attributes(r.unit, r.alt).map((a) => (
                  <AttributeChip key={a.key} a={a} />
                ))}
                {extras.map((e) => (
                  <Tag key={e}>{e}</Tag>
                ))}
              </div>
              <div className="hidden w-44 shrink-0 lg:block">
                <SizeBars before={r.unit.size} after={r.alt.size} />
              </div>
              <div className="hidden w-24 shrink-0 text-right text-sm md:block">
                <ChangeText bytes={r.change} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
