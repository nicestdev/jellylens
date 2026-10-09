"use client";

import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import {
  Check,
  CircleArrowDown,
  Library,
  Link2,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import { Breakable } from "@/components/breakable";
import { DataTable, MUTED_CELL, NOT_ON_PHONE, NUMBER_CELL, ROW } from "@/components/library-table";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import type { MatchInfo, WcxAddResponse, WcxMirror, WcxRelease, WcxSource } from "@/lib/api-types";
import { formatBytes, formatDate, plural } from "@/lib/format";
import { matchActions, NO_GROUP, withoutTitle } from "@/lib/release-labels";
import { toast } from "@/lib/toast";
import { rankIn } from "@/lib/facets";
import { formatFacet, type ReleaseRow } from "@/lib/title-rows";
import { cn } from "@/lib/utils";

// The title page's tables (components/title-view.tsx): xREL's releases and
// WCX's, the columns after the name at the same widths, so they line up.

const ACTION_ICONS: Record<string, LucideIcon> = { wrong: Unlink, xrel: Link2, auto: RotateCcw };

// The ⋯ menu that fixes one xREL title's match by hand: drop TMDB's data,
// take xREL's link after all, or go back to the automatic check.
export function MatchMenu({
  label,
  match,
  saving,
  onPick,
}: {
  label: string;
  match: MatchInfo;
  saving: boolean;
  onPick: (verdict: MatchInfo["verdict"]) => void;
}) {
  const actions = matchActions(match);
  if (!actions.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`More options for ${label}`}
        disabled={saving}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        {saving ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto max-w-80">
        {actions.map((a) => {
          const Icon = ACTION_ICONS[a.verdict ?? "auto"];
          return (
            <DropdownMenuItem key={a.label} onClick={() => onPick(a.verdict)}>
              <Icon />
              {a.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// What the name says, as one line under it: group, quality, codec, audio
// (and a grouped xREL entry's episodes).
const attributeLine = (r: ReleaseRow) =>
  [
    r.group ?? NO_GROUP,
    r.resolution ? formatFacet("resolution", r.resolution) : null,
    r.codec || null,
    r.audio,
    r.episodes ? plural(r.episodes, "episode") : null,
  ]
    .filter(Boolean)
    .join(" · ");

// One table: the release's name (linking to href's page) over its group,
// quality, codec and audio, with action's buttons at the right of the same
// cell; then size and date, at fixed widths so xREL's and WCX's tables line
// up. library: what the library has of it (libraryNote), shown as
// Downloads does, a peach icon in front of the name. On a phone size and
// date join the line under the name; both may wrap to two lines there.
// Where a release is listed (xREL, WCX), a tag each.
// A release's name: one line, but two (broken anywhere) on a phone.
const NAME = "truncate font-medium max-sm:line-clamp-2 max-sm:whitespace-normal max-sm:[overflow-wrap:anywhere]";

export function ReleaseTable<R extends ReleaseRow>({
  rows,
  href,
  action,
  library,
}: {
  rows: R[];
  href: (r: R) => string | undefined;
  action?: (r: R) => ReactNode;
  library: (r: R) => string | null;
}) {
  return (
    <DataTable
      columns={[
        { label: "Release", stretch: true },
        { label: "Size", align: "right", width: "w-24", phone: false },
        { label: "Date", width: "w-28", phone: false },
      ]}
    >
      {rows.map((r) => {
        const link = href(r);
        const owned = library(r);
        const buttons = action?.(r);
        return (
          <tr key={r.id} className={ROW}>
            <td className="max-w-0 px-3 py-2">
              {/* On a phone the actions go under the name, at full width. */}
              <div className="flex gap-3 max-sm:flex-col max-sm:gap-1.5 sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5" title={r.name}>
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(NAME, "transition-colors hover:text-primary")}
                      >
                        <Breakable text={withoutTitle(r.name, { keepEpisode: true })} />
                      </a>
                    ) : (
                      <span className={NAME}>
                        <Breakable text={withoutTitle(r.name, { keepEpisode: true })} />
                      </span>
                    )}
                    {/* After the name, like on Downloads: you may have it already. */}
                    {owned ? (
                      <span title={owned} className="shrink-0 text-warning">
                        <Library className="size-3.5" aria-label={owned.split("\n")[0]} />
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground max-sm:whitespace-normal">
                    {attributeLine(r)}
                    <span className="sm:hidden">
                      {[r.size ? formatBytes(r.size) : null, r.date ? formatDate(r.date) : null]
                        .filter(Boolean)
                        .map((v) => ` · ${v}`)
                        .join("")}
                    </span>
                  </div>
                </div>
                {buttons ? <div className="shrink-0 max-sm:w-full">{buttons}</div> : null}
              </div>
            </td>
            <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{r.size ? formatBytes(r.size) : "—"}</td>
            <td className={cn(MUTED_CELL, NOT_ON_PHONE, "font-num tabular-nums")}>
              {r.date ? formatDate(r.date) : "—"}
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}

// A mirror's button: "DD" in ddownload's blue, "RG" in rapidgator's
// orange (the theme's, --dd and --rg), else the hoster's first two letters ("katfile.com" → "KA").
// dark: too, or the outline button's own dark border and fill win.
const HOSTERS: Record<string, { short: string; className: string }> = {
  "ddownload.com": {
    short: "DD",
    className:
      "border-dd/50 bg-dd/10 text-dd hover:bg-dd/20 hover:text-dd dark:border-dd/50 dark:bg-dd/10 dark:hover:bg-dd/20",
  },
  "rapidgator.net": {
    short: "RG",
    className:
      "border-rg/50 bg-rg/10 text-rg hover:bg-rg/20 hover:text-rg dark:border-rg/50 dark:bg-rg/10 dark:hover:bg-rg/20",
  },
};
// A row's mirrors, of every WCX copy of it, side by side: by hoster (DD,
// RG, then the rest A–Z), a live one before a dead one.
const HOSTER_ORDER = Object.keys(HOSTERS);
const rank = rankIn(HOSTER_ORDER);
export function sortMirrors(copies: WcxRelease[]): { release: WcxRelease; mirror: WcxMirror }[] {
  return copies
    .flatMap((release) => release.mirrors.map((mirror) => ({ release, mirror })))
    .sort(
      (a, b) =>
        rank(a.mirror.hoster) - rank(b.mirror.hoster) ||
        a.mirror.hoster.localeCompare(b.mirror.hoster) ||
        Number(Boolean(a.mirror.offline)) - Number(Boolean(b.mirror.offline)),
    );
}

const shortName = (hoster: string) => HOSTERS[hoster]?.short ?? hoster.slice(0, 2).toUpperCase();

// A mirror's source as its line says it, in this order: WCX's plain
// links, a hide.cx container's (read through its API), a filecrypt
// container (a captcha: only opened, for its DLC).
const SOURCES: Record<WcxSource, string> = { wcx: "wcx", "hide.cx": "hide.cx", filecrypt: "filecrypt" };
const SOURCE_ORDER = Object.keys(SOURCES) as WcxSource[];
// The badge's text, four letters at most, its full name on hover.
const SOURCE_BADGE: Record<WcxSource, string> = { wcx: "wcx", "hide.cx": "hide", filecrypt: "file" };

// A row's mirrors as a small grid: a line per source (its name in front,
// in a plain badge), a column per hoster (DD, RG, then the rest), the same widths in
// every row so they line up down the table. Of a mirror WCX has more copies of, the
// best one: live, then the most links (sortMirrors puts live ones first).
export function MirrorGroups({
  copies,
  render,
}: {
  copies: WcxRelease[];
  render: (release: WcxRelease, mirror: WcxMirror) => ReactNode;
}) {
  const best = new Map<string, { release: WcxRelease; mirror: WcxMirror }>();
  for (const x of sortMirrors(copies)) {
    const key = `${x.mirror.source}:${x.mirror.hoster}`;
    const known = best.get(key);
    if (!known || (known.mirror.offline === x.mirror.offline && x.mirror.links > known.mirror.links)) best.set(key, x);
  }
  const hosters = [
    ...HOSTER_ORDER,
    ...new Set([...best.values()].map((x) => x.mirror.hoster).filter((h) => !HOSTER_ORDER.includes(h))),
  ];
  const sources = SOURCE_ORDER.filter((src) => hosters.some((h) => best.has(`${src}:${h}`)));
  return (
    // Fixed widths from sm up, so the grids line up down the table; on a
    // phone, where it sits under the name, it spreads over the row.
    <div
      className="grid grid-cols-[3.25rem_repeat(var(--hosters),2.25rem)] items-center gap-1 max-sm:grid-cols-[minmax(0,1.5fr)_repeat(var(--hosters),minmax(0,1fr))]"
      style={{ "--hosters": hosters.length } as CSSProperties}
    >
      {sources.map((src) => (
        <Fragment key={src}>
          <span
            title={SOURCES[src]}
            className="flex h-6 items-center justify-center rounded-md border px-1.5 text-xs font-medium text-muted-foreground uppercase"
          >
            {SOURCE_BADGE[src]}
          </span>
          {hosters.map((h) => {
            const x = best.get(`${src}:${h}`);
            return x ? <Fragment key={h}>{render(x.release, x.mirror)}</Fragment> : <span key={h} />;
          })}
        </Fragment>
      ))}
    </div>
  );
}

// A WCX release's mirror's button (DD, RG), in its source's line of its
// row on the title page: a click adds it to
// Downloads from that mirror, or, for a filecrypt one, opens the container
// for its DLC. Mirrors we have no account for show greyed out, dead ones
// struck through. A note pops up (added, with View; or why not), and the
// mirror's button keeps a check (the page holds one of these).
export function useMirrors(tmdbId: string | null): (release: WcxRelease, mirror: WcxMirror) => ReactNode {
  const mirrorKey = (r: WcxRelease, m: WcxMirror) => `${r.uid}:${m.source}:${m.hoster}`;
  const [adding, setAdding] = useState<string | null>(null);
  // Release uid → the mirror (mirrorKey) it was added from.
  const [added, setAdded] = useState<Record<string, string>>({});

  async function add(release: WcxRelease, mirror: WcxMirror) {
    if (!tmdbId) return;
    setAdding(mirrorKey(release, mirror));
    try {
      await apiFetch<WcxAddResponse>(
        "/api/wcx-releases",
        jsonRequest("POST", { tmdbId, release: release.uid, hoster: mirror.hoster, source: mirror.source }),
      );
      setAdded((a) => ({ ...a, [release.uid]: mirrorKey(release, mirror) }));
      toast("Added to Downloads", {
        description: release.name,
        tone: "success",
        icon: CircleArrowDown,
        action: { label: "View", href: "/downloads" },
      });
    } catch (e) {
      toast("Couldn't add to Downloads", { description: (e as Error).message, tone: "removed" });
    } finally {
      setAdding(null);
    }
  }

  function mirrorButton(r: WcxRelease, m: WcxMirror) {
    const key = mirrorKey(r, m);
    if (m.source === "filecrypt") {
      const title = `${m.hoster} on filecrypt: open it for the DLC (it asks for a captcha)`;
      return (
        <a
          key={key}
          href={m.container ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={title}
          title={title}
          className={cn(buttonVariants({ variant: "outline", size: "xs" }), HOSTERS[m.hoster]?.className)}
        >
          {shortName(m.hoster)}
        </a>
      );
    }
    if (m.offline) {
      const title =
        m.source === "wcx"
          ? `${m.hoster}: the links are gone (re-uploaded?)`
          : `${m.hoster}: the container's links aren't all online`;
      return (
        <Button key={key} variant="outline" size="xs" disabled aria-label={title} title={title}>
          <span className="line-through">{shortName(m.hoster)}</span>
        </Button>
      );
    }
    const from = added[r.uid];
    return (
      <Button
        key={key}
        variant="outline"
        size="xs"
        className={HOSTERS[m.hoster]?.className}
        disabled={!m.route || adding !== null || Boolean(from)}
        onClick={() => add(r, m)}
        aria-label={`Add ${r.name} to Downloads from ${m.hoster} (${SOURCES[m.source]})`}
        title={`${m.hoster} · ${plural(m.links, "link")} from ${SOURCES[m.source]} · ${m.route ?? "no account"}`}
      >
        {/* In place of the name: the column is as wide as "DD". */}
        {adding === key ? <Loader2 className="animate-spin" /> : from === key ? <Check /> : shortName(m.hoster)}
      </Button>
    );
  }

  return mirrorButton;
}
