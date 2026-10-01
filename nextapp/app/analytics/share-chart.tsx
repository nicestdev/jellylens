"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LibraryAnalytics } from "@/lib/api-types";
import { formatBytes, formatNumber, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  codecSegments,
  groupSegments,
  languageSegments,
  percent,
  resolutionSegments,
  selectedSegments,
  type ListFilters,
  type Segment,
} from "./logic";

// One card: its pieces, measured by files or by storage. A donut's pieces
// split the whole; with overlap they don't (a file has several
// languages), so each is a ring of its own out of total files (radial
// bars).
export type Ring = {
  key: string;
  title: string;
  segments: Segment[];
  measure: "files" | "size";
  overlap?: { total: number };
};

// The ring: radius and thickness in the 140×140 viewBox, and the gap
// between pieces along it (in the card's color, so pieces stay apart).
const SIZE = 140;
const R = 54;
const RING = 18;
const GAP = 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

const valueText = (measure: Ring["measure"], n: number) => (measure === "files" ? plural(n, "file") : formatBytes(n));
const shortText = (measure: Ring["measure"], n: number) => (measure === "files" ? formatNumber(n) : formatBytes(n));

// One card of the share chart: the ring, and its legend beside it with
// each piece's share and value. The ring's middle shows the total, or the
// piece under the pointer or focus (its share, value and name): the
// tooltip; without one, the piece whose files are listed (selected).
// Clicking a piece or legend entry lists its files (onSelect).
function Donut({
  ring,
  hovered,
  selected,
  pick,
  onSelect,
}: {
  ring: Ring;
  hovered: string | null;
  selected: Set<string>;
  pick: (key: string | null) => void;
  onSelect: (segment: Segment) => void;
}) {
  const m = ring.measure;
  const parts = ring.segments.filter((s) => s[m] > 0);
  const total = parts.reduce((t, s) => t + s[m], 0);
  const gap = parts.length > 1 ? GAP : 0;
  const active = parts.some((s) => s.key === hovered) ? hovered : (parts.find((s) => selected.has(s.key))?.key ?? null);
  const current = parts.find((s) => s.key === active);
  // Where each piece starts along the ring: the lengths of those before it.
  const lengths = parts.map((s) => (s[m] / total) * CIRCUMFERENCE);
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
  const handlers = pieceHandlers(pick, onSelect);

  return (
    <figure className="h-full rounded-xl border bg-card p-4">
      <figcaption className="text-xs text-muted-foreground">{ring.title}</figcaption>
      <div className="mt-3 flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative size-40 shrink-0">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90" onPointerLeave={() => pick(null)}>
            {parts.map((s, i) => {
              const dash = Math.max(lengths[i] - gap, 1);
              return (
                <circle
                  key={s.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === s.key ? RING + 4 : RING}
                  strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                  strokeDashoffset={-starts[i]}
                  tabIndex={0}
                  role="button"
                  aria-label={`${s.label}: ${valueText(m, s[m])}, ${percent(s[m], total)} of ${ring.title.toLowerCase()}`}
                  {...handlers(s)}
                  onKeyDown={onEnter(onSelect, s)}
                  className={cn(
                    "cursor-pointer transition-[opacity,stroke-width] outline-none",
                    active && active !== s.key && "opacity-35"
                  )}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-9 text-center">
            {current ? (
              <>
                <div className="text-xl font-semibold tracking-tight">{percent(current[m], total)}</div>
                <div className="text-xs text-foreground">{valueText(m, current[m])}</div>
                <div className="mt-0.5 flex max-w-full items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: current.color }} />
                  <span className="truncate">{current.label}</span>
                </div>
              </>
            ) : (
              <>
                <div className="text-xl font-semibold tracking-tight">{shortText(m, total)}</div>
                <div className="text-xs text-muted-foreground">{m === "files" ? "files" : "storage"}</div>
              </>
            )}
          </div>
        </div>

        <Legend parts={parts} measure={m} total={total} active={active} pick={pick} handlers={handlers} />
      </div>
    </figure>
  );
}

// Each piece's color, name, share and value, beside its chart; an entry
// picks out its piece like the piece itself (handlers).
function Legend({
  parts,
  measure: m,
  total,
  active,
  pick,
  handlers,
}: {
  parts: Segment[];
  measure: Ring["measure"];
  total: number;
  active: string | null;
  pick: (key: string | null) => void;
  handlers: (s: Segment) => object;
}) {
  return (
    <ul
      className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-0.5 text-xs"
      onPointerLeave={() => pick(null)}
    >
      {parts.map((s) => (
        <li key={s.key} className="col-span-4 grid grid-cols-subgrid">
          <button
            type="button"
            {...handlers(s)}
            className={cn(
              "col-span-4 -mx-1.5 grid grid-cols-subgrid items-center rounded px-1.5 py-1 text-left transition-[opacity,background-color] hover:bg-muted",
              active && active !== s.key && "opacity-50"
            )}
          >
            <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} />
            <span className={cn("truncate", s.muted ? "text-muted-foreground" : "font-medium text-foreground")}>
              {s.label}
            </span>
            <span className="text-right text-foreground tabular-nums">{percent(s[m], total)}</span>
            <span className="text-right text-muted-foreground tabular-nums">{shortText(m, s[m])}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// The pointer, focus and click handlers of a piece and its legend entry.
function pieceHandlers(pick: (key: string | null) => void, onSelect: (segment: Segment) => void) {
  return (s: Segment) => ({
    onPointerEnter: () => pick(s.key),
    onFocus: () => pick(s.key),
    onBlur: () => pick(null),
    onClick: () => onSelect(s),
  });
}

const onEnter = (onSelect: (segment: Segment) => void, s: Segment) => (e: KeyboardEvent) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  onSelect(s);
};

// The radial bars: one ring per piece, the most files outside, each
// filled to its share of every file, over a track of the whole. Clicking
// a ring (or anywhere on its track) lists its files, as on a donut.
const BAR = 8;
const BAR_STEP = 11;
const BAR_OUTER = 62;

function RadialBars({
  ring,
  hovered,
  selected,
  pick,
  onSelect,
}: {
  ring: Ring & { overlap: NonNullable<Ring["overlap"]> };
  hovered: string | null;
  selected: Set<string>;
  pick: (key: string | null) => void;
  onSelect: (segment: Segment) => void;
}) {
  const { total } = ring.overlap;
  const parts = ring.segments.filter((s) => s.files > 0);
  const active = parts.some((s) => s.key === hovered) ? hovered : (parts.find((s) => selected.has(s.key))?.key ?? null);
  const handlers = pieceHandlers(pick, onSelect);

  return (
    <figure className="h-full rounded-xl border bg-card p-4">
      <figcaption className="text-xs text-muted-foreground">{ring.title}</figcaption>
      <div className="mt-3 flex flex-col items-center gap-5 sm:flex-row">
        <div className="size-40 shrink-0">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90" onPointerLeave={() => pick(null)}>
            {parts.map((s, i) => {
              const r = BAR_OUTER - i * BAR_STEP;
              const circumference = 2 * Math.PI * r;
              const length = Math.max((s.files / total) * circumference, 0.5);
              return (
                <g
                  key={s.key}
                  tabIndex={0}
                  role="button"
                  aria-label={`${s.label}: ${plural(s.files, "file")}, ${percent(s.files, total)} of all files`}
                  {...handlers(s)}
                  onKeyDown={onEnter(onSelect, s)}
                  className={cn(
                    "cursor-pointer transition-opacity outline-none",
                    active && active !== s.key && "opacity-35"
                  )}
                >
                  <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" strokeWidth={BAR} className="stroke-muted" />
                  <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={BAR}
                    strokeLinecap="round"
                    strokeDasharray={`${length} ${circumference}`}
                  />
                </g>
              );
            })}
          </svg>
        </div>
        <Legend parts={parts} measure="files" total={total} active={active} pick={pick} handlers={handlers} />
      </div>
    </figure>
  );
}

// A row of cards under a heading that scrolls sideways without a
// scrollbar: one card a view on phones, two from lg up, snapping to each.
// Two small arrows by the heading move it by one card, dimmed at either
// end; swiping works as usual.
const SLIDE = "w-full shrink-0 snap-start lg:w-[calc(50%-0.375rem)]";

function Carousel({ title, children }: { title: string; children: ReactNode[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () =>
      setEdges({ prev: el.scrollLeft > 4, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);

  // One card and the gap after it.
  const page = (dir: 1 | -1) => {
    const el = track.current;
    const card = el?.firstElementChild;
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: dir * (card.getBoundingClientRect().width + gap), behavior: "smooth" });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {edges.prev || edges.next ? (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous charts"
              disabled={!edges.prev}
              onClick={() => page(-1)}
              className="text-muted-foreground"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More charts"
              disabled={!edges.next}
              onClick={() => page(1)}
              className="text-muted-foreground"
            >
              <ChevronRight />
            </Button>
          </div>
        ) : null}
      </div>
      <div
        ref={track}
        className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children.map((child, i) => (
          <div key={i} className={SLIDE}>
            {child}
          </div>
        ))}
      </div>
    </>
  );
}

// What makes up the library: the files and storage by release group (the
// same groups in the same colors in both, so hovering one picks it out in
// both), then the files by audio language, by resolution and by codec. A piece's files are
// listed below on click (onSelect), which sets the file list's filters;
// a piece stays picked out while they list exactly its files.
export function ShareChart({
  stats,
  filters,
  onSelect,
}: {
  stats: LibraryAnalytics;
  filters: ListFilters;
  onSelect: (segment: Segment) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (!stats.files) return null;

  const groups = groupSegments(stats);
  const rings: Ring[] = [
    { key: "group-files", title: "Files by group", segments: groups, measure: "files" },
    { key: "group-size", title: "Storage by group", segments: groups, measure: "size" },
    {
      key: "language",
      title: "Files by audio language",
      segments: languageSegments(stats),
      measure: "files",
      overlap: { total: stats.files },
    },
    { key: "resolution", title: "Files by resolution", segments: resolutionSegments(stats), measure: "files" },
    { key: "codec", title: "Files by codec", segments: codecSegments(stats), measure: "files" },
  ];
  const selected = selectedSegments(rings.flatMap((r) => r.segments), filters);

  return (
    <section className="mt-8">
      <Carousel title="Share of the library">
        {rings
          .filter((r) => r.segments.some((s) => s[r.measure] > 0))
          .map((r) =>
            r.overlap ? (
              <RadialBars
                key={r.key}
                ring={{ ...r, overlap: r.overlap }}
                hovered={hovered}
                selected={selected}
                pick={setHovered}
                onSelect={onSelect}
              />
            ) : (
              <Donut key={r.key} ring={r} hovered={hovered} selected={selected} pick={setHovered} onSelect={onSelect} />
            )
          )}
      </Carousel>
    </section>
  );
}
