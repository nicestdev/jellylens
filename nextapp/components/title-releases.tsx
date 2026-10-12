"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  Link2,
  Loader2,
  Lock,
  MoreHorizontal,
  RotateCcw,
  Unlink,
  MirrorRectangular,
  X,
  type LucideIcon,
} from "lucide-react";
import { Breakable } from "@/components/breakable";
import { LibraryIcon } from "@/components/library-icon";
import { TableFrame } from "@/components/section-frame";
import { CELL, NOT_ON_PHONE, NUMBER_CELL, ROW } from "@/components/library-table";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COUNTS_STALE, apiFetch, jsonRequest } from "@/lib/api-client";
import type { MatchInfo, SeasonAiring, WcxAddResponse, WcxRelease } from "@/lib/api-types";
import { formatBytes, formatDate, plural } from "@/lib/format";
import { matchActions, NO_GROUP, withoutTitle } from "@/lib/release-labels";
import { toast } from "@/lib/toast";
import { formatFacet, type LibraryMark, type ReleaseRow } from "@/lib/title-rows";
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

// What the name says, as one line under it: group, quality, codec, audio.
const attributeLine = (r: ReleaseRow, disks?: string | null) =>
  [r.group ?? NO_GROUP, r.resolution ? formatFacet("resolution", r.resolution) : null, r.codec || null, r.audio, disks]
    .filter(Boolean)
    .join(" · ");

// One table: the release's name (linking to href's page) over its group,
// quality, codec and audio; its mirror to take in a column of its own (when
// any row has some); then size and date, at fixed widths. On a phone
// size, date and episodes join the line under the name and the mirror
// goes on its right; the name may wrap to two lines there. Episodes, when any row says:
// how many it holds (of one the library has, how many of it you have)
// against the season's aired ones (TMDB's), framed in
// its color so it reads apart from the size next to it: red when
// fewer (a release not kept up), sky when it has them all but more are
// still to come, green when the season is complete; when the release has
// more than you have, yours in peach and the release's next to it. open, onToggle: a heading that folds the rows away (a
// show's seasons). library: what the library has
// of a release, its name in peach with the disk icon and the disks at the
// end of the line under it when it's this very release. title, count: its heading (a show's season, its episodes), "Releases" and how
// many unless given. A library row (ghostRows, owned set): its name in
// peach with the disk icon, the disks it's on after its audio; no
// link, mirror or date.
// A release's name: one line, but two (broken anywhere) on a phone.
// How many episodes a release has against the season's aired ones: red
// when fewer, sky when more are still to come, else green (complete).
const episodesTone = (episodes: number | null, aired?: SeasonAiring | null) =>
  episodes && aired
    ? episodes < aired.aired
      ? "text-destructive"
      : aired.total > aired.aired
        ? "text-info"
        : "text-success"
    : null;
const BADGE = "inline-flex h-6 min-w-8 items-center justify-center rounded-md border-2 border-current/35 px-1.5";
const NAME = "truncate font-medium max-sm:line-clamp-2 max-sm:whitespace-normal max-sm:[overflow-wrap:anywhere]";

export function ReleaseTable<R extends ReleaseRow>({
  title = "Releases",
  count,
  rows,
  href,
  mirrors,
  library,
  aired,
  open,
  onToggle,
}: {
  title?: string;
  count?: ReactNode;
  rows: R[];
  href: (r: R) => string | undefined;
  mirrors?: (r: R) => ReactNode;
  library?: (r: R) => LibraryMark | null;
  aired?: SeasonAiring | null;
  open?: boolean;
  onToggle?: () => void;
}) {
  const hasMirrors = Boolean(mirrors) && rows.some((r) => mirrors?.(r));
  const hasEpisodes = rows.some((r) => r.episodes);
  return (
    <TableFrame
      title={title}
      count={count ?? rows.length}
      open={open}
      onToggle={onToggle}
      columns={[
        { label: "Release", stretch: true },
        ...(hasMirrors ? [{ label: "Mirror", width: "w-20", phone: false as const }] : []),
        ...(hasEpisodes ? [{ label: "Episodes", align: "right" as const, width: "w-22", phone: false as const }] : []),
        { label: "Size", align: "right", width: "w-[6.875rem]", phone: false },
        { label: "Date", align: "right", width: "w-[7.875rem]", phone: false },
      ]}
    >
      {rows.map((r) => {
        const ghost = r.owned !== undefined;
        const link = ghost ? undefined : href(r);
        const buttons = ghost ? null : mirrors?.(r);
        const owned = ghost ? null : library?.(r);
        // A pack the library has: how many of it you have, not it has.
        const episodes = owned?.episodes ?? r.episodes;
        // The release has grown since (a pack kept up): yours as a note,
        // then the release's own count against the aired ones.
        const of = owned?.episodes != null && r.episodes && owned.episodes < r.episodes ? r.episodes : null;
        const tone = of ? "text-warning" : episodesTone(episodes, aired);
        // Only on the library's own rows and this very release: the disk icon,
        // and the disks at the end of the line under the name.
        const disks = ghost ? r.owned : owned?.exact ? owned.disks : null;
        const diskIcon = (className: string) => (disks ? <LibraryIcon className={className} /> : null);
        return (
          <tr key={r.id} className={cn(ROW, "h-17")}>
            <td className={cn(CELL, "max-w-0")}>
              {/* On a phone the mirror goes on the right of the name. */}
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(NAME, owned?.exact && "text-warning", "transition-colors hover:text-bright")}
                      >
                        <Breakable text={withoutTitle(r.name, { keepEpisode: true })} />
                        {/* On a phone the name wraps, so the icon goes after its last word. */}
                        {diskIcon("ml-1.5 inline-block align-[-0.125em] sm:hidden")}
                      </a>
                    ) : (
                      <span className={cn(NAME, ghost && "text-warning")}>
                        <Breakable text={withoutTitle(r.name, { keepEpisode: true })} />
                        {diskIcon("ml-1.5 inline-block align-[-0.125em] sm:hidden")}
                      </span>
                    )}
                    {diskIcon("max-sm:hidden")}
                  </div>
                  <div className="mt-0.75 truncate text-[0.8125rem] text-muted-foreground max-sm:whitespace-normal">
                    {attributeLine(r, disks)}
                    <span className="sm:hidden">
                      {episodes ? (
                        <>
                          {" · "}
                          {of ? (
                            <>
                              <span className={cn(tone)}>{episodes}</span> /{" "}
                              <span className={cn(episodesTone(of, aired))}>{of} episodes</span>
                            </>
                          ) : (
                            <span className={cn(tone)}>{plural(episodes, "episode")}</span>
                          )}
                        </>
                      ) : null}
                      {[r.size ? formatBytes(r.size) : null, r.date ? formatDate(r.date) : null]
                        .filter(Boolean)
                        .map((v) => ` · ${v}`)
                        .join("")}
                    </span>
                  </div>
                </div>
                {buttons ? <div className="shrink-0 sm:hidden">{buttons}</div> : null}
              </div>
            </td>
            {hasMirrors ? <td className={cn(CELL, NOT_ON_PHONE)}>{buttons}</td> : null}
            {hasEpisodes ? (
              <td className={cn(NUMBER_CELL, NOT_ON_PHONE, tone)}>
                {episodes ? (
                  <span className="inline-flex gap-1">
                    <span className={BADGE}>{episodes}</span>
                    {of ? <span className={cn(BADGE, episodesTone(of, aired))}>{of}</span> : null}
                  </span>
                ) : (
                  "—"
                )}
              </td>
            ) : null}
            <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{r.size ? formatBytes(r.size) : "—"}</td>
            <td className={cn(NUMBER_CELL, NOT_ON_PHONE)}>{r.date ? formatDate(r.date) : ghost ? null : "—"}</td>
          </tr>
        );
      })}
    </TableFrame>
  );
}

// The Mirror column's button, just an icon, the same size in every state
// (a tint behind it while hovered): a mirror to Check,
// a spinner while it checks, then a green check (added), a lock in
// filecrypt's blue (a captcha: a click opens it for its DLC) or a red
// cross (nothing works). A note says what happened, in words.
const CHIP =
  "inline-grid size-8 cursor-pointer place-items-center rounded-lg text-sub-foreground transition-colors hover:bg-muted hover:text-bright disabled:cursor-default disabled:hover:bg-transparent [&_svg]:size-4";
const DONE = "cursor-default hover:bg-transparent";
// A hoster's short name: "DD", "RG", else its first two letters
// ("katfile.com" → "KA").
const HOSTERS: Record<string, string> = { "ddownload.com": "DD", "rapidgator.net": "RG" };
const shortName = (hoster: string) => HOSTERS[hoster] ?? hoster.slice(0, 2).toUpperCase();

type CheckState =
  | { state: "checking" }
  | { state: "added"; hoster: string; source: string }
  | { state: "captcha"; url: string; hoster: string }
  | { state: "none" };

// A release's Check button, in its row on the title page (copies: its WCX
// copies): a click has the server try its mirrors in order (RG before DD,
// hide.cx before WCX; lib/mirrors.ts) and add the first online one to
// the Queue, where it starts right away if the library has nothing of it
// (else it waits in Needs attention); else it offers filecrypt, or
// says nothing works. The page holds one of these.
export function useMirrorCheck(tmdbId: string | null): (copies: WcxRelease[]) => ReactNode {
  // Per release (its copies' uids) what its Check came to.
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  const set = (key: string, c: CheckState | null) =>
    setChecks((prev) => {
      const next = { ...prev };
      if (c) next[key] = c;
      else delete next[key];
      return next;
    });

  async function check(key: string, copies: WcxRelease[]) {
    if (!tmdbId) return;
    set(key, { state: "checking" });
    try {
      const res = await apiFetch<WcxAddResponse>(
        "/api/wcx-releases",
        jsonRequest("POST", { tmdbId, releases: copies.map((r) => r.uid) }),
      );
      // The button shows how it went, a note says it: started, waits for a
      // hand, a captcha in the way, or nothing online.
      const name = copies[0]?.name;
      if (res.result === "added") {
        set(key, { state: "added", hoster: res.hoster, source: res.source });
        toast(res.started ? "Download started" : "Needs attention", {
          description: res.name,
          mono: true,
          tone: res.started ? "success" : "warning",
          action: { label: "View", href: "/queue" },
        });
        // The sidebar's Queue count takes it in.
        window.dispatchEvent(new Event(COUNTS_STALE));
      } else if (res.result === "captcha") {
        set(key, { state: "captcha", url: res.url, hoster: res.hoster });
        toast("Behind a captcha: the lock opens it", { description: name, mono: true, tone: "warning" });
      } else {
        set(key, { state: "none" });
        toast("No mirror online", { description: name, mono: true, tone: "error" });
      }
    } catch (e) {
      set(key, null);
      toast("Couldn't check its mirrors", { description: (e as Error).message, tone: "error" });
    }
  }

  return function checkButton(copies: WcxRelease[]) {
    const key = copies.map((r) => r.uid).join(",");
    const c = checks[key];
    if (c?.state === "captcha") {
      const title = `Captcha: no mirror online, open ${c.hoster} on filecrypt for the DLC`;
      return (
        <a
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={title}
          className={cn(CHIP, "text-fc hover:text-fc")}
        >
          <Lock />
        </a>
      );
    }
    if (c?.state === "added") {
      const title = `In the Queue, from ${shortName(c.hoster)} (${c.source})`;
      return (
        <span role="img" aria-label={title} className={cn(CHIP, DONE, "text-success hover:text-success")}>
          <Check />
        </span>
      );
    }
    if (c?.state === "none") {
      const title = "No mirror online, and no filecrypt container";
      return (
        <span role="img" aria-label={title} className={cn(CHIP, DONE, "text-destructive hover:text-destructive")}>
          <X />
        </span>
      );
    }
    const checking = c?.state === "checking";
    const title = checking ? "Checking its mirrors" : "Check its mirrors and add the first that works";
    return (
      <button
        type="button"
        className={CHIP}
        disabled={checking}
        onClick={() => check(key, copies)}
        aria-label={`${title}: ${copies[0].name}`}
      >
        {checking ? <Loader2 className="animate-spin" /> : <MirrorRectangular />}
      </button>
    );
  };
}
