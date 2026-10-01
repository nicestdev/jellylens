"use client";

import { Fragment, useEffect, useState } from "react";
import { Link2, Loader2, MoreHorizontal, RotateCcw, Unlink, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Poster } from "@/components/poster";
import { apiFetch, tmdbImage, tmdbUrl } from "@/lib/api-client";
import type { MatchInfo, ReleaseDetail as Detail, TitleRelease, WcxSearchResponse } from "@/lib/api-types";
import { formatDate, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { matchActions, matchNote, qualityLabel, titleMeta } from "@/lib/release-labels";

const ACTION_ICONS: Record<string, LucideIcon> = { wrong: Unlink, xrel: Link2, auto: RotateCcw };

// Release names have no spaces; they wrap after a dot or dash instead of
// mid-word.
function BreakableName({ name }: { name: string }) {
  return name.split(/(?<=[.-])/).map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

// The ⋯ menu that fixes one xREL title's match by hand: drop TMDB's data,
// take xREL's link after all, or go back to the automatic check.
function MatchMenu({
  label,
  match,
  saving,
  onPick,
  className,
}: {
  label: string;
  match: MatchInfo;
  saving: boolean;
  onPick: (verdict: MatchInfo["verdict"]) => void;
  className?: string;
}) {
  const actions = matchActions(match);
  if (!actions.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`More options for ${label}`}
        disabled={saving}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground", className)}
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

function ReleaseList({ items }: { items: Detail["titles"][number]["Items"] }) {
  return (
    <ul className="divide-y">
      {items.map((r) => (
        <li key={r.id} className="px-4 py-3">
          <a
            href={r.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium [overflow-wrap:anywhere] transition-colors hover:text-primary"
          >
            <BreakableName name={r.name} />
          </a>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[r.group, qualityLabel(r.quality), formatDate(r.publishedAt)].filter(Boolean).join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

// What the panel shows until its releases have loaded: a Releases tile, or
// a request or collection movie (key: its TMDB entry, "movie:949"; their
// number isn't known yet). library: owned in Jellyfin, with its poster.
export type PanelTitle = {
  key: string;
  title: string;
  year: number | null;
  posterPath: string | null;
  mediaType: "movie" | "tv" | null;
  tmdbId: number | null;
  releases?: number;
  library?: { id: string; imageTag?: string | null } | null;
};

// The side panel a Releases tile opens, and the group badges on Requests
// and Missing: every release of a tile, newest first, each linking to its
// xREL page. A tile with several titles (one movie xREL lists twice, or a
// movie's releases split by year, see toRelease in lib/xrel.ts) lists them
// one after the other, each with its own ⋯ menu, since usually only one of
// them is matched wrong. onChanged: what opened it should reload, since the
// tile changed. only: list just the releases it keeps (Upgrades: one
// group's, of one season), saying which (note). Admins only, like
// /api/releases.
export function ReleasePanel({
  title,
  onClose,
  onChanged,
  only,
}: {
  title: PanelTitle | null;
  onClose: () => void;
  onChanged: () => void;
  only?: { keep: (r: TitleRelease) => boolean; note: string };
}) {
  // Tagged with the tile they belong to, so reopening another one never
  // shows the last one's list (or error) for a moment. The value can be
  // another tile: where a decision moved the title to.
  const [detail, setDetail] = useState<{ key: string; value: Detail } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [wcx, setWcx] = useState<{ name: string; url: string | null } | null>(null);
  const key = title?.key;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    apiFetch<Detail>(`/api/releases/${encodeURIComponent(key)}`)
      .then((res) => !cancelled && setDetail({ key, value: res }))
      .catch((e) => !cancelled && setFailed({ key, message: (e as Error).message }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = key && detail?.key === key ? detail.value : null;
  const error = key && failed?.key === key ? failed.message : "";
  const titles = (current?.titles ?? [])
    .map((t) => (only ? { ...t, Items: t.Items.filter(only.keep) } : t))
    .filter((t) => !only || t.Items.length);

  const newestName = titles[0]?.Items[0]?.name;
  const tmdbId = title?.tmdbId && title.mediaType ? `${title.mediaType}:${title.tmdbId}` : null;
  useEffect(() => {
    if (!newestName || !tmdbId) return;
    let cancelled = false;
    apiFetch<WcxSearchResponse>(
      `/api/wcx-search?q=${encodeURIComponent(newestName)}&tmdbId=${encodeURIComponent(tmdbId)}`
    )
      .then((res) => !cancelled && setWcx({ name: newestName, url: res.url }))
      .catch(() => !cancelled && setWcx({ name: newestName, url: null }));
    return () => {
      cancelled = true;
    };
  }, [newestName, tmdbId]);
  const wcxUrl = newestName && wcx?.name === newestName ? wcx.url : null;

  async function decide(titleKey: string, verdict: MatchInfo["verdict"]) {
    if (!key || !current) return;
    setSaving(titleKey);
    try {
      const res = await apiFetch<Detail>(`/api/releases/${encodeURIComponent(current.key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleKey, verdict }),
      });
      setDetail({ key, value: res });
      onChanged();
    } catch (e) {
      setFailed({ key, message: (e as Error).message });
    } finally {
      setSaving(null);
    }
  }

  // After a decision the panel follows what the tile shows now; the
  // library's poster only while it's still the owned title.
  const first = titles[0]?.match.shown;
  const shown =
    title && current
      ? { ...title, ...first, releases: titles.reduce((sum, t) => sum + t.Items.length, 0) }
      : title;
  const owned = title?.library && shown?.tmdbId === title.tmdbId;
  const posterProps = shown
    ? owned && title?.library?.imageTag
      ? { itemId: title.library.id, tag: title.library.imageTag }
      : { imageSrc: tmdbImage(shown.posterPath) }
    : {};
  const tmdb = shown?.tmdbId && shown.mediaType ? tmdbUrl(shown.mediaType, shown.tmdbId) : undefined;
  const single = titles.length === 1 ? titles[0] : null;
  const note = single
    ? matchNote(single.match)
    : titles.length > 1
      ? `Grouped from ${titles.length} titles, each matched on its own.`
      : null;

  return (
    <Sheet open={title !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        {shown ? (
          <>
            {/* Room on the right for the close button, and the ⋯ menu of a single title. */}
            <SheetHeader className={cn("flex-row gap-4 border-b", single ? "pr-20" : "pr-12")}>
              <Poster {...posterProps} alt="" height={240} className="w-16 shrink-0 rounded-md" />
              <div className="min-w-0">
                <SheetTitle className="text-base">{shown.title}</SheetTitle>
                <SheetDescription>{titleMeta(shown)}</SheetDescription>
                {note ? <p className="mt-1.5 text-xs text-muted-foreground">{note}</p> : null}
                {only ? <p className="mt-1.5 text-xs text-muted-foreground">{only.note}</p> : null}
                {tmdb || wcxUrl ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tmdb ? (
                      <a href={tmdb} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary">
                        TMDB
                      </a>
                    ) : null}
                    {tmdb && wcxUrl ? " · " : null}
                    {wcxUrl ? (
                      <a href={wcxUrl} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary">
                        WCX
                      </a>
                    ) : null}
                  </p>
                ) : null}
              </div>
              {single ? (
                <MatchMenu
                  label={shown.title}
                  match={single.match}
                  saving={saving === single.titleKey}
                  onPick={(verdict) => decide(single.titleKey, verdict)}
                  className="absolute top-3 right-11"
                />
              ) : null}
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {error ? (
                <p className="p-4 text-sm text-destructive">Failed to load releases: {error}</p>
              ) : !current ? (
                <div className="space-y-4 p-4">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i}>
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="mt-2 h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : single ? (
                <ReleaseList items={single.Items} />
              ) : (
                titles.map((t) => {
                  const titleNote = matchNote(t.match);
                  return (
                    <section key={t.titleKey} className="border-b last:border-b-0">
                      <div className="flex items-start gap-2 border-b bg-muted/40 py-2 pr-2 pl-4">
                        <div className="min-w-0 flex-1 py-0.5">
                          <p className="text-sm font-medium">{t.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {[plural(t.Items.length, "release"), titleNote].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <MatchMenu
                          label={t.label}
                          match={t.match}
                          saving={saving === t.titleKey}
                          onPick={(verdict) => decide(t.titleKey, verdict)}
                        />
                      </div>
                      <ReleaseList items={t.Items} />
                    </section>
                  );
                })
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
