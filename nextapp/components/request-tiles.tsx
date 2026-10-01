"use client";

import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { CornerBadge, PosterCard, type PosterBadge } from "@/components/poster-card";
import { apiFetch, tmdbImage, tmdbUrl } from "@/lib/api-client";
import type { DiscoverItem, DiscoverResponse, RequestItem as Request, RequestsResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { releasedHint, releasedLabel } from "@/lib/release-labels";

type MediaType = "movie" | "tv";

// Anything that can be requested: a search or trending result, a request,
// or a collection's missing part. library: already in Jellyfin (by TMDB
// id). availability: how far along its release is when it isn't fully out
// yet (null = out, or owned), computed server-side from TMDB.
export type Result = Pick<DiscoverItem, "mediaType" | "tmdbId" | "title" | "year" | "library" | "availability"> & {
  releaseDate?: string | null;
  posterPath: string | null;
};
type Availability = Result["availability"];

export const itemKey = (r: { mediaType: MediaType; tmdbId: number }) => `${r.mediaType}:${r.tmdbId}`;
const TYPE_LABEL: Record<MediaType, string> = { movie: "Movie", tv: "Show" };

const loadRequests = () => apiFetch<RequestsResponse>("/api/requests");

// Only the not-yet-home-watchable states get a badge; fully out is normal.
const STATUS_BADGE: Record<NonNullable<Availability>["status"], PosterBadge> = {
  upcoming: { label: "Upcoming", tone: "neutral", hint: "Not released yet" },
  cinema: { label: "In cinemas", tone: "warning", hint: "In cinemas only — not streaming or on disc yet" },
  digital: { label: "Digital only", tone: "neutral", hint: "Streaming, but no Blu-ray yet" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "28 Sep", or "3 Feb 2027" outside the current year. Built by hand because
// en-GB's short month is "Sept".
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return [d, MONTHS[m - 1], y === new Date().getFullYear() ? null : y].filter(Boolean).join(" ");
}

// Year, then the next release date if one is coming (e.g. "Digital 28 Sep")
// — the badge already says what state it's in — or else Movie/Show.
function metaLine(item: Result): string {
  const next = item.availability?.next;
  return [item.year, next ? `${next.kind} ${shortDate(next.date)}` : TYPE_LABEL[item.mediaType]]
    .filter(Boolean)
    .join(" · ");
}

function statusBadge(item: Result, ownedLabel: string): PosterBadge | undefined {
  if (item.library) return { label: ownedLabel, tone: "success" };
  return item.availability ? STATUS_BADGE[item.availability.status] : undefined;
}

function posterSrc(path: string | null): string | null {
  return tmdbImage(path);
}

// The ✓ on a Discover tile that's already requested. Deliberately not a
// button: a second tap there was usually meant as "add", not "cancel".
// Taking a request back happens on the Your requests tab (×).
function RequestedMark() {
  return (
    <span
      title="Requested"
      aria-label="Requested"
      className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-md backdrop-blur-md"
    >
      <Check className="size-4" />
    </span>
  );
}

// The round button on a tile's poster: + to request, × to remove from the
// requests list.
function TileButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full bg-background/75 text-foreground shadow-md ring-1 ring-white/15 backdrop-blur-md transition-colors ring-inset hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
    >
      <Icon className="size-4" />
    </button>
  );
}

const latestRequest = (r: Request) =>
  r.requesters?.reduce((latest, q) => (q.requestedAt > latest ? q.requestedAt : latest), "") ?? r.requestedAt;

// The user's request list plus everything that changes it — for admins
// everyone's (overview), with who asked. Arrived ones sort first (they're
// the news), then the most wanted, then the most recently asked for.
export function useRequests() {
  const list = useLoad(loadRequests);
  const items = list.data?.Items ?? [];
  const all = list.data?.all ?? false;
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  // Errors of what the user just did; the load's own error shows otherwise.
  const [actionError, setError] = useState("");
  const error = actionError || (list.error && `Failed to load requests: ${list.error}`);

  // everyone: an admin removing the request for all who asked.
  async function toggle(item: Result, requested: boolean, everyone = false) {
    const k = itemKey(item);
    setPending((prev) => new Set(prev).add(k));
    try {
      const res = await apiFetch<RequestsResponse>("/api/requests", {
        method: requested ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          title: item.title,
          year: item.year,
          releaseDate: item.releaseDate,
          posterPath: item.posterPath,
          everyone,
        }),
      });
      list.setData(res);
      setError("");
    } catch (e) {
      setError(`Couldn't update request: ${(e as Error).message}`);
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
    }
  }

  const mine = items.filter((r) => r.mine);
  const shown = all ? items : mine;
  const sorted = [...shown].sort(
    (a, b) =>
      Number(Boolean(b.library)) - Number(Boolean(a.library)) ||
      (b.requesters?.length ?? 0) - (a.requesters?.length ?? 0) ||
      latestRequest(b).localeCompare(latestRequest(a))
  );
  return {
    requests: sorted,
    overview: all,
    admin: list.data?.admin ?? false,
    reload: list.reload,
    requestedKeys: new Set(mine.map(itemKey)),
    availableCount: shown.filter((r) => r.library).length,
    loading: list.loading,
    pending,
    error,
    toggle,
  };
}

// TMDB search as you type, debounced; an empty query gives what's trending.
// The abort drops responses for queries that were already typed past.
// Results remember which query they answer, so "loading" is a mismatch.
export function useDiscover(q: string) {
  const [results, setResults] = useState<{ q: string; items: Result[]; error: string } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<DiscoverResponse>(`/api/discover?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        setResults({ q, items: res.Items, error: "" });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setResults({ q, items: [], error: `TMDB search failed: ${(e as Error).message}` });
      }
    }, q ? 350 : 0);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);
  const loading = results?.q !== q;
  return { items: loading ? [] : results!.items, loading, error: results?.error ?? "" };
}

// showReleases: opens a poster's releases instead of its TMDB page
// (admins only).
type TileContext = {
  pending: Set<string>;
  toggle: (item: Result, requested: boolean, everyone?: boolean) => void;
  showReleases?: (item: Result) => void;
};

// The bottom-right corner of anything that can be requested (Discover,
// Releases): In library when it's owned, else + to request, ✓ once
// requested (not clickable). Requested needs no badge — the filled ✓
// already says so.
export function RequestAction({ item, requested, ctx }: { item: Result; requested: boolean; ctx: TileContext }) {
  if (item.library) return <CornerBadge badge={{ label: "In library", tone: "success" }} className="relative" />;
  if (requested) return <RequestedMark />;
  return (
    <TileButton
      icon={Plus}
      label="Request"
      disabled={ctx.pending.has(itemKey(item))}
      onClick={() => ctx.toggle(item, false)}
    />
  );
}

// A search/trending result.
export function ResultTile({ item, requested, ctx }: { item: Result; requested: boolean; ctx: TileContext }) {
  return (
    <PosterCard
      onClick={ctx.showReleases ? () => ctx.showReleases!(item) : undefined}
      href={ctx.showReleases ? undefined : tmdbUrl(item.mediaType, item.tmdbId)}
      imageSrc={posterSrc(item.posterPath)}
      title={item.title}
      meta={metaLine(item)}
      badge={item.availability ? STATUS_BADGE[item.availability.status] : undefined}
      action={<RequestAction item={item} requested={requested} ctx={ctx} />}
    />
  );
}

// "Anna, Ben" — who asked, in the order they did.
function requesterNames(item: Request): string {
  return (item.requesters ?? []).map((q) => q.name).join(", ");
}

// One request: × removes it; bottom left, a badge for the favorite groups
// that have released it ("FuN +1"), which opens their releases for an admin. In the admin's overview (item.requesters
// set) the info line says who asked, a badge top left counts them once it's
// more than one, and × removes it for all of them.
export function RequestTile({ item, ctx }: { item: Request; ctx: TileContext }) {
  const overview = Boolean(item.requesters);
  const count = item.requesters?.length ?? 0;
  const names = requesterNames(item);
  return (
    <PosterCard
      onClick={ctx.showReleases ? () => ctx.showReleases!(item) : undefined}
      href={ctx.showReleases ? undefined : tmdbUrl(item.mediaType, item.tmdbId)}
      imageSrc={posterSrc(item.posterPath)}
      title={item.title}
      meta={overview ? [item.year, names].filter(Boolean).join(" · ") : metaLine(item)}
      badge={statusBadge(item, "Available")}
      filterBadge={
        item.releaseGroups.length
          ? { label: releasedLabel(item.releaseGroups), hint: releasedHint(item.releaseGroups) }
          : undefined
      }
      countBadge={count > 1 ? { label: `${count} requests`, tone: "accent", hint: names } : undefined}
      action={
        <TileButton
          icon={X}
          label={overview ? "Remove for everyone" : "Remove request"}
          disabled={ctx.pending.has(itemKey(item))}
          onClick={() => ctx.toggle(item, true, overview)}
        />
      }
    />
  );
}
