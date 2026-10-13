"use client";

import Link from "next/link";
import { CELL, NUMBER_CELL, ROW, TITLE_CELL, type Column } from "@/components/library-table";
import { PosterCard } from "@/components/poster-card";
import { SectionFrame, TableFrame } from "@/components/section-frame";
import { tmdbImage } from "@/lib/api-client";
import type { OrganizeDisk, OrganizeMoved, RequestItem } from "@/lib/api-types";
import { displayName, type Section } from "@/app/queue/logic";
import { formatBytes, relativeTime } from "@/lib/format";
import { titlePath } from "@/lib/title-path";
import { cn } from "@/lib/utils";
import { diskLow, freeShare, importTiles, queueRows, seasonsLabel, totalFree, type QueueTone } from "./logic";
import { Dots } from "@/components/dot";

// The Dashboard's tables: the library's disks, the wishlist and what came
// in last. Each a table headed with its section, as small as a
// phone (no width under which it scrolls).

function Empty({ text, span }: { text: string; span: number }) {
  return (
    <tr className={ROW}>
      <td colSpan={span} className={cn(CELL, "text-muted-foreground")}>
        {text}
      </td>
    </tr>
  );
}

// Free says the heading already ("Disks · 4.12 TB free").
const diskColumns: Column[] = [{ label: "Disks" }, { label: "Free", align: "right", hidden: true }];

// A disk: its name over a bar of what's used, what's free; under 5 % free
// both red, the bar dimmed like the episode dots.
export function DisksTable({ disks, loading }: { disks: OrganizeDisk[]; loading: boolean }) {
  return (
    <TableFrame
      title="Disks"
      count={disks.length ? `${formatBytes(totalFree(disks))} free` : undefined}
      columns={diskColumns}
      minWidth="min-w-0"
      busy={loading}
    >
      {disks.length ? (
        disks.map((d) => (
          <tr key={d.disk} className={cn(ROW, "h-auto")}>
            <td className={cn(TITLE_CELL, "py-2")}>
              <div className="font-medium">{d.disk}</div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track">
                <div
                  className={cn("h-full rounded-full", diskLow(d) ? "bg-destructive/60" : "bg-muted-foreground/60")}
                  style={{ width: `${(1 - freeShare(d)) * 100}%` }}
                />
              </div>
            </td>
            {/* What's free, under it of how much (on the bar's line). */}
            <td className={cn(NUMBER_CELL, "py-2 align-top", diskLow(d) && "text-destructive")}>
              <div>{d.freeBytes === null ? "—" : formatBytes(d.freeBytes)}</div>
              {d.totalBytes ? (
                <div className="mt-0.5 text-xs text-muted-foreground">of {formatBytes(d.totalBytes)}</div>
              ) : null}
            </td>
          </tr>
        ))
      ) : (
        <Empty text={loading ? "Loading" : "No library disks"} span={2} />
      )}
    </TableFrame>
  );
}

const wishColumns: Column[] = [{ label: "Wishlist" }, { label: "Added", align: "right" }];

// The wishlist's latest open titles; each opens its title page.
export function WishlistTable({ items, total }: { items: RequestItem[]; total: number }) {
  return (
    <TableFrame title="Wishlist" count={total} columns={wishColumns} minWidth="min-w-0">
      {items.map((r) => (
        <tr key={`${r.mediaType}:${r.tmdbId}`} className={ROW}>
          <td className={TITLE_CELL}>
            <Link href={titlePath(`${r.mediaType}:${r.tmdbId}`)} className="font-medium">
              {r.title}
            </Link>
          </td>
          <td className={NUMBER_CELL}>{relativeTime(r.requestedAt)}</td>
        </tr>
      ))}
    </TableFrame>
  );
}

// What was moved into the library in the last 7 days, as posters (three
// across on a phone): the title, its disk and when; the release name on
// hover. Each opens its title page.
// Only with something in it.
export function ImportsTable({ moved }: { moved: OrganizeMoved[] }) {
  const tiles = importTiles(moved);
  if (!tiles.length) return null;
  return (
    <SectionFrame title="Last imports" count={tiles.length}>
      <div className="-mx-3 grid grid-cols-3 gap-3 border-t border-row p-3 sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]">
        {tiles.map((m) => (
          <div key={m.key} className="min-w-0">
            <PosterCard
              href={m.media ? titlePath(`${m.media.type}:${m.media.tmdbId}`) : undefined}
              imageSrc={tmdbImage(m.media?.posterPath, "w185")}
              title={m.media?.title ?? m.name}
              meta={[seasonsLabel(m.seasons), relativeTime(m.movedAt)]}
            />
          </div>
        ))}
      </div>
    </SectionFrame>
  );
}

// The Queue in one table, simplified (queueRows): each title and where
// it's at, a click opens the Queue. running: the downloads' speed and time
// left, on the heading's right.
const TONE: Record<QueueTone, string> = {
  error: "text-destructive",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
};

export function QueueTable({ parts, running }: { parts: Section[]; running: string[] }) {
  const rows = queueRows(parts);
  if (!rows.length) return null;
  return (
    <TableFrame
      title="Queue"
      count={rows.length}
      columns={[{ label: "Queue" }, { label: <Dots parts={running} />, align: "right", width: "w-1/2" }]}
      minWidth="min-w-0"
    >
      {rows.map(({ key, pkg, line, tone }) => {
        return (
          <tr key={key} className={ROW}>
            <td className={TITLE_CELL}>
              <Link href="/queue" className="font-medium">
                {displayName(pkg)}
              </Link>
            </td>
            <td className={cn(CELL, "max-w-0 truncate text-right", tone ? TONE[tone] : "text-muted-foreground")}>
              {line.filter(Boolean).join(" ")}
            </td>
          </tr>
        );
      })}
    </TableFrame>
  );
}
