"use client";

import { useState, type ReactNode } from "react";
import type { AnalyticsResponse } from "@/lib/api-types";
import { formatBytes, formatNumber, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { audioRows, codecRows, percent, resolutionRows, type Row } from "./logic";
import { Dot, Dots } from "@/components/dot";

// The page's one palette: the accent mixed into the track, the more the
// larger (a square root, so small parts still show).
const heat = (fraction: number) =>
  `color-mix(in oklab, var(--p-accent) ${Math.round(8 + Math.sqrt(fraction) * 70)}%, var(--p-track))`;

function Frame({
  title,
  right,
  footer,
  children,
}: {
  title: string;
  right?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="min-w-0 rounded-lg border bg-card">
      <div className="flex min-h-9 items-center justify-between gap-4 border-b px-3 text-sm font-medium">
        {title}
        {right ? <span className="text-[0.8125rem] font-normal text-muted-foreground">{right}</span> : null}
      </div>
      {/* More room under the content than over it, where the heading's line sits. */}
      <div className="px-3 pt-3 pb-5">{children}</div>
      {footer ? <div className="border-t px-3 py-2 text-xs text-muted-foreground">{footer}</div> : null}
    </section>
  );
}

// How many files have German and English audio, the aim being all of
// them: the share over both libraries, then a bar each, then the rest.
export function AudioGoal({ data }: { data: AnalyticsResponse }) {
  const rows = audioRows(data);
  const both = rows.find((r) => r.key === "DE+EN");
  const bothMovies = both?.movies ?? 0;
  const bothEpisodes = both?.episodes ?? 0;
  const meter = (label: string, part: number, total: number) => (
    <div>
      <div className="flex justify-between gap-3 text-[0.8125rem]">
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">
          {formatNumber(part)} of {formatNumber(total)} <Dot />{" "}
          <span className="text-foreground">{percent(part, total)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${(part / (total || 1)) * 100}%`, background: heat(1) }}
        />
      </div>
    </div>
  );
  const files = data.movies.files + data.shows.files;
  return (
    <Frame
      title="Dual language"
      footer={rows
        .filter((r) => r !== both)
        .map((r, i) => (
          <span key={r.key}>
            {i ? (
              <>
                {" "}
                <Dot />{" "}
              </>
            ) : (
              ""
            )}
            {r.label} <span className="text-xs text-foreground">{formatNumber(r.movies + r.episodes)}</span>
          </span>
        ))}
    >
      {/* The share as big as a stat tile's number. */}
      <div className="text-2xl leading-tight">{percent(bothMovies + bothEpisodes, files)}</div>
      <div className="mt-3 grid gap-4">
        {meter("Movies", bothMovies, data.movies.files)}
        {meter("Episodes", bothEpisodes, data.shows.files)}
      </div>
    </Frame>
  );
}

// A size with three digits at most ("727 GB", "5.32 TB"), for a phone's
// narrow cells.
function shortBytes(bytes: number): string {
  const [n, unit] = formatBytes(bytes).split("\u202f");
  const v = Number(n);
  return `${formatNumber(v, { maximumFractionDigits: v >= 100 ? 0 : v >= 10 ? 1 : 2 })}\u202f${unit}`;
}

// Resolution down, codec across, each cell's bytes (and files, from sm up)
// shaded by its share of the largest: where the space goes.
export function QualityHeatmap({ data }: { data: AnalyticsResponse }) {
  const resolutions = resolutionRows(data);
  const codecs = codecRows(data);
  const max = Math.max(1, ...data.quality.map((c) => c.size));
  return (
    <Frame title="Resolution & codec" right="by size">
      <div className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(${codecs.length}, minmax(0, 1fr))` }}>
        <span />
        {codecs.map((c) => (
          <span key={c.key} className="truncate pb-1 text-center text-xs text-muted-foreground">
            {c.label}
          </span>
        ))}
        {resolutions.map((r) => (
          <div key={r.key} className="contents">
            <span className="self-center pr-2 text-xs">{r.label}</span>
            {codecs.map((c) => {
              const cell = data.quality.find((x) => x.resolution === r.key && x.codec === c.key);
              const fraction = cell ? cell.size / max : 0;
              return (
                <div
                  key={c.key}
                  className="flex h-12 min-w-0 flex-col items-center justify-center rounded-md text-xs sm:h-14"
                  style={{
                    background: cell ? heat(fraction) : undefined,
                    color: fraction > 0.36 ? "var(--p-mantle)" : undefined,
                  }}
                >
                  {cell ? (
                    <>
                      <span className="font-mono font-medium max-sm:hidden">{formatBytes(cell.size)}</span>
                      <span className="font-mono font-medium sm:hidden">{shortBytes(cell.size)}</span>
                      <span className="opacity-70 max-sm:hidden">{plural(cell.files, "file")}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Frame>
  );
}

// The groups by size, a bar each. Pointing at one (hovering, focusing or
// tapping it) says its movies, episodes and share in the line under them,
// which otherwise sums them all up.
// groups: how many there are, the ones folded into a row too.
export function GroupRanking({ rows, groups }: { rows: Row[]; groups: number }) {
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.size));
  const row = rows.find((r) => r.key === picked);
  const total = rows[0]?.total ?? 0;
  return (
    <Frame
      title="Release groups"
      right="by size"
      footer={
        row ? (
          <>
            <Dots
              parts={[
                <span key="l" className="font-mono text-foreground">
                  {row.label}
                </span>,
                plural(row.movies, "movie"),
                plural(row.episodes, "episode"),
                percent(row.size, row.total),
              ]}
            />
          </>
        ) : (
          <Dots
            parts={[
              plural(groups, "group"),
              <span key="t" className="font-mono">
                {formatBytes(total)}
              </span>,
            ]}
          />
        )
      }
    >
      <div className="-mx-1.5 grid" onPointerLeave={(e) => e.pointerType === "mouse" && setPicked(null)}>
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={r.key === picked}
            onPointerEnter={(e) => e.pointerType === "mouse" && setPicked(r.key)}
            onFocus={() => setPicked(r.key)}
            onClick={() => setPicked(r.key)}
            className={cn(
              "grid cursor-pointer grid-cols-[minmax(0,6.5rem)_1fr_5.5rem] items-center gap-3 rounded-md px-1.5 py-1 text-left text-sm outline-none",
              r.key === picked && "bg-muted/60",
            )}
          >
            <span className="truncate font-mono text-xs">{r.label}</span>
            <span className="h-4 overflow-hidden rounded-sm">
              <span
                className="block h-full rounded-sm"
                style={{ width: `${Math.max(1, (r.size / max) * 100)}%`, background: heat(r.size / max) }}
              />
            </span>
            <span className="text-right font-mono text-xs text-sub-foreground">{formatBytes(r.size)}</span>
          </button>
        ))}
      </div>
    </Frame>
  );
}
