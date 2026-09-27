"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { PosterCard, type PosterBadge } from "@/components/poster-card";
import { apiFetch } from "@/lib/api-client";

type MediaType = "movie" | "tv";
// Set when the item is already in Jellyfin (matched by TMDB id).
type LibraryRef = { id: string; serverId: string } | null;

// How far along the release is, when it isn't fully out yet (null = out, or
// owned). next = the next relevant date: a digital or Blu-ray release, the
// cinema start, or a show's premiere. Computed server-side from TMDB.
type Availability = {
  status: "upcoming" | "cinema" | "digital";
  next: { kind: string; date: string } | null;
} | null;

export type Result = {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  year: number | null;
  releaseDate?: string | null;
  posterPath: string | null;
  library: LibraryRef;
  availability: Availability;
};
export type Request = Result & { requestedAt: string };

export const itemKey = (r: { mediaType: MediaType; tmdbId: number }) => `${r.mediaType}:${r.tmdbId}`;
const TYPE_LABEL: Record<MediaType, string> = { movie: "Movie", tv: "Show" };

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
  return path ? `https://image.tmdb.org/t/p/w342${path}` : null;
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

// The user's request list plus everything that changes it. Arrived ones sort
// first (they're the news), then newest request first.
export function useRequests() {
  const [jellyfinUrl, setJellyfinUrl] = useState("");
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [config, res] = await Promise.all([
        apiFetch<{ jellyfinPublicUrl: string }>("/api/config"),
        apiFetch<{ Items: Request[] }>("/api/requests"),
      ]);
      setJellyfinUrl(config.jellyfinPublicUrl);
      setRequests(res.Items ?? []);
    } catch (e) {
      setError(`Failed to load requests: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(item: Result, requested: boolean) {
    const k = itemKey(item);
    setPending((prev) => new Set(prev).add(k));
    try {
      const res = await apiFetch<{ Items: Request[] }>("/api/requests", {
        method: requested ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          title: item.title,
          year: item.year,
          releaseDate: item.releaseDate,
          posterPath: item.posterPath,
        }),
      });
      setRequests(res.Items ?? []);
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

  const sorted = [...requests].sort(
    (a, b) => Number(Boolean(b.library)) - Number(Boolean(a.library)) || b.requestedAt.localeCompare(a.requestedAt)
  );
  return {
    jellyfinUrl,
    requests: sorted,
    requestedKeys: new Set(requests.map(itemKey)),
    availableCount: requests.filter((r) => r.library).length,
    loading,
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
        const res = await apiFetch<{ Items: Result[] }>(`/api/discover?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        setResults({ q, items: res.Items ?? [], error: "" });
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

function itemHref(item: Result, jellyfinUrl: string): string {
  if (item.library) return `${jellyfinUrl}/web/index.html#!/details?id=${item.library.id}&serverId=${item.library.serverId}`;
  return `https://www.themoviedb.org/${item.mediaType}/${item.tmdbId}`;
}

type TileContext = { jellyfinUrl: string; pending: Set<string>; toggle: (item: Result, requested: boolean) => void };

// A search/trending result: + to request, ✓ once requested (not clickable).
// Requested needs no badge — the filled ✓ already says so.
export function ResultTile({ item, requested, ctx }: { item: Result; requested: boolean; ctx: TileContext }) {
  return (
    <PosterCard
      href={itemHref(item, ctx.jellyfinUrl)}
      imageSrc={posterSrc(item.posterPath)}
      title={item.title}
      meta={metaLine(item)}
      badge={statusBadge(item, "In library")}
      action={
        item.library ? undefined : requested ? (
          <RequestedMark />
        ) : (
          <TileButton
            icon={Plus}
            label="Request"
            disabled={ctx.pending.has(itemKey(item))}
            onClick={() => ctx.toggle(item, false)}
          />
        )
      }
    />
  );
}

// One of the user's requests: × removes it.
export function RequestTile({ item, ctx }: { item: Request; ctx: TileContext }) {
  return (
    <PosterCard
      href={itemHref(item, ctx.jellyfinUrl)}
      imageSrc={posterSrc(item.posterPath)}
      title={item.title}
      meta={metaLine(item)}
      badge={statusBadge(item, "Available")}
      action={
        <TileButton
          icon={X}
          label="Remove request"
          disabled={ctx.pending.has(itemKey(item))}
          onClick={() => ctx.toggle(item, true)}
        />
      }
    />
  );
}
