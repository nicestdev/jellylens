"use client";

import Link from "next/link";
import { CELL, NUMBER_CELL, ROW, TITLE_CELL, type Column } from "@/components/library-table";
import { PosterCard } from "@/components/poster-card";
import { SectionFrame, TableFrame } from "@/components/section-frame";
import { tmdbImage } from "@/lib/api-client";
import type { OrganizeDisk, OrganizeMoved, RequestItem } from "@/lib/api-types";
import { displayName, errorLine, type Section } from "@/app/queue/logic";
import { targetOf } from "@/app/queue/organize-logic";
import { formatBytes, relativeTime } from "@/lib/format";
import { titlePath } from "@/lib/title-path";
import { cn } from "@/lib/utils";
import { diskLow, freeShare, totalFree } from "./logic";

// The Dashboard's narrow column: the library's disks, the wishlist and
// what came in last. Each a table headed with its section, as small as a
// phone (no width under which it scrolls).

const withYear = (title: string, year: number | null | undefined) => (year ? `${title} (${year})` : title);

function Empty({ text, span }: { text: string; span: number }) {
  return (
    <tr className={ROW}>
      <td colSpan={span} className={cn(CELL, "text-muted-foreground")}>
        {text}
      </td>
    </tr>
  );
}

const diskColumns: Column[] = [{ label: "Disks" }, { label: "Free", align: "right" }];

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
              {withYear(r.title, r.year)}
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
export function ImportsTable({ moved, loading }: { moved: OrganizeMoved[]; loading: boolean }) {
  return (
    <SectionFrame title="Last imports" count={loading && !moved.length ? undefined : moved.length}>
      {moved.length ? (
        <div className="-mx-3 grid grid-cols-3 gap-3 border-t border-row p-3 sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]">
          {moved.map((m) => (
            <div key={m.id} className="min-w-0">
              <PosterCard
                href={m.media ? titlePath(`${m.media.type}:${m.media.tmdbId}`) : undefined}
                imageSrc={tmdbImage(m.media?.posterPath, "w185")}
                title={m.media?.title ?? m.name}
                meta={`${m.movedTo.split("/")[0]} · ${relativeTime(m.movedAt)}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="-mx-3 border-t border-row px-3 py-2 text-sm text-muted-foreground">
          {loading ? "Loading" : "Nothing in the last 7 days"}
        </p>
      )}
    </SectionFrame>
  );
}

const queueColumns: Column[] = [{ label: "Queue" }, { label: "", align: "right" }];

// The Queue's sections that need a hand (Needs attention, then Ready to
// organize) in one table, simplified: each title and a word on it, a
// click opens the Queue. Why it failed (red), Waiting for a start, or
// where it goes: the disk.
export function QueueTable({ parts }: { parts: Section[] }) {
  const rows = parts.flatMap((part) => {
    const ready = part.title === "Ready to organize";
    return [
      ...part.packages.map((p) => ({ key: `p${p.id}`, pkg: p, error: p.error ?? "", note: "" })),
      // One being moved (or waiting to be) needs nothing more.
      ...part.items
        .filter((i) => !ready || !i.move)
        .map((i) => ({
          key: `i${i.id}`,
          pkg: i,
          error: ready ? null : i.error || i.move?.error || "",
          note: targetOf(i)?.disk ?? "—",
        })),
      ...part.moved.map((m) => ({ key: `m${m.id}`, pkg: m, error: m.move?.error ?? "", note: "" })),
      ...part.pending.map((p) => ({ key: `p${p.id}`, pkg: p, error: null, note: "Waiting" })),
    ];
  });
  if (!rows.length) return null;
  return (
    <TableFrame title="Queue" count={rows.length} columns={queueColumns} minWidth="min-w-0">
      {rows.map(({ key, pkg, error, note }) => {
        const name = displayName(pkg);
        return (
          <tr key={key} className={ROW}>
            <td className={TITLE_CELL}>
              <Link href="/queue" className="font-medium">
                {withYear(name.title, name.year)}
              </Link>
            </td>
            <td className={cn(CELL, "text-right", error === null ? "text-muted-foreground" : "text-destructive")}>
              {error === null ? note : errorLine(error)}
            </td>
          </tr>
        );
      })}
    </TableFrame>
  );
}
