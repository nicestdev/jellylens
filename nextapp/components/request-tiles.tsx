"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HardDrive, Heart } from "lucide-react";
import { PosterCard } from "@/components/poster-card";
import { latestRequest } from "@/app/wishlist/logic";
import { REQUESTS_CHANGED, apiFetch, tmdbImage, tmdbUrl, jsonRequest } from "@/lib/api-client";
import type { DiscoverItem, DiscoverResponse, RequestItem as Request, RequestsResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { useWindowEvent } from "@/hooks/use-window-event";
import { titlePath } from "@/lib/title-path";
import { cn } from "@/lib/utils";

type MediaType = "movie" | "tv";

// Anything that can be requested: a search or trending result, or a
// request. library: already in the library (by TMDB id). availability: how far along its release is when it isn't fully out
// yet (null = out, or owned), computed server-side from TMDB.
export type Result = Pick<DiscoverItem, "mediaType" | "tmdbId" | "title" | "year" | "library" | "availability"> & {
  releaseDate?: string | null;
  posterPath: string | null;
};

export const itemKey = (r: { mediaType: MediaType; tmdbId: number }) => `${r.mediaType}:${r.tmdbId}`;
const TYPE_LABEL: Record<MediaType, string> = { movie: "Movie", tv: "Show" };

export const loadRequests = () => apiFetch<RequestsResponse>("/api/requests");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "28 Sep", or "3 Feb 2027" outside the current year. Built by hand because
// en-GB's short month is "Sept".
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return [d, MONTHS[m - 1], y === new Date().getFullYear() ? null : y].filter(Boolean).join(" ");
}

// Year, then the next release date if one is coming (e.g. "Digital 28 Sep"),
// or else Movie/Show.
function metaLine(item: Result): string {
  const next = item.availability?.next;
  return [item.year, next ? `${next.kind} ${shortDate(next.date)}` : TYPE_LABEL[item.mediaType]]
    .filter(Boolean)
    .join(" · ");
}

// A poster's In library mark, top right where the heart would be (what's
// owned can't be wished for): the library icon in peach (like the Queue's) in a round chip, the heart's
// size, nothing to click. className: its place, beside a heart. small: on
// a title page's poster, which is smaller than a tile's.
function LibraryMark({ className, small = false }: { className?: string; small?: boolean }) {
  return (
    <span
      role="img"
      aria-label="In library"
      className={cn(
        "pointer-events-auto absolute grid place-items-center rounded-full bg-sidebar/75 text-warning",
        small ? SMALL_MARK : MARK,
        className,
      )}
    >
      <HardDrive className={small ? SMALL_ICON : "size-5"} strokeWidth={2} />
    </span>
  );
}

// A mark's place and size: a tile's, or (SMALL_) a title page's poster's,
// a phone's smaller still.
const MARK = "top-2 right-2 size-10";
const SMALL_MARK = "top-1.5 right-1.5 size-8 sm:top-2 sm:right-2 sm:size-9";
const SMALL_ICON = "size-4 sm:size-4.5";

// A poster's heart, top right, red: on the wishlist it's filled and
// always there; off it, an outline, it shows while the poster is hovered or the button
// focused (always on touch screens, which can't hover). A click puts the
// title on the wishlist or takes it off (no note: it shows right there); the rest of
// the poster still opens the title.
function HeartToggle({
  on,
  title,
  everyone = false,
  small = false,
  disabled,
  onClick,
}: {
  on: boolean;
  title: string;
  everyone?: boolean;
  small?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  // everyone: it takes it off everyone's (the Wishlist's overview).
  const label = on
    ? everyone
      ? `Remove ${title} for everyone`
      : `Remove ${title} from wishlist`
    : `Add ${title} to wishlist`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "pointer-events-auto absolute grid cursor-pointer place-items-center rounded-full transition-opacity duration-150 disabled:opacity-60",
        small ? SMALL_MARK : MARK,
        on
          ? "bg-sidebar/75 text-wish"
          : "bg-sidebar/60 text-wish opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
      )}
    >
      <Heart className={cn(small ? SMALL_ICON : "size-5", on && "fill-current")} strokeWidth={on ? 0 : 1.8} />
    </button>
  );
}

// How long a request taken off on the Wishlist stays in sight.
const LINGER_MS = 2000;

// The user's request list plus everything that changes it — for admins
// everyone's (overview), with who asked. The most wanted first, then the
// most recently asked for.
export function useRequests() {
  const list = useLoad(loadRequests);
  // A change made elsewhere (a note's Undo after the page that made it was
  // left) reaches this page's list too.
  useWindowEvent<RequestsResponse>(REQUESTS_CHANGED, list.setData);
  const items = list.data?.items ?? [];
  const all = list.data?.all ?? false;
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  // Errors of what the user just did; the load's own error shows otherwise.
  const [actionError, setError] = useState("");
  const error = actionError || (list.error && `Failed to load the wishlist: ${list.error}`);

  // Taken off on the Wishlist (linger): kept where it was for LINGER_MS,
  // its heart empty, so a slip can be clicked back; then it goes. at: its
  // place in the list then.
  const [leaving, setLeaving] = useState<Map<string, { item: Request; at: number }>>(() => new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  const forget = (k: string) => {
    clearTimeout(timers.current.get(k));
    timers.current.delete(k);
    setLeaving((prev) => {
      const next = new Map(prev);
      next.delete(k);
      return next;
    });
  };

  // everyone: an admin removing the request for all who asked.
  async function toggle(item: Result, requested: boolean, everyone = false, linger = false) {
    const k = itemKey(item);
    setPending((prev) => new Set(prev).add(k));
    try {
      const res = await apiFetch<RequestsResponse>(
        "/api/requests",
        jsonRequest(requested ? "DELETE" : "POST", {
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          title: item.title,
          year: item.year,
          releaseDate: item.releaseDate,
          posterPath: item.posterPath,
          everyone,
        }),
      );
      if (requested && linger) {
        const at = sorted.findIndex((r) => itemKey(r) === k);
        if (at >= 0) {
          setLeaving((prev) => new Map(prev).set(k, { item: sorted[at], at }));
          timers.current.set(
            k,
            setTimeout(() => forget(k), LINGER_MS),
          );
        }
      } else if (!requested) forget(k);
      list.setData(res);
      window.dispatchEvent(new CustomEvent(REQUESTS_CHANGED, { detail: res }));
      setError("");
    } catch (e) {
      setError(`Couldn't update the wishlist: ${(e as Error).message}`);
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
      (b.requesters?.length ?? 0) - (a.requesters?.length ?? 0) || latestRequest(b).localeCompare(latestRequest(a)),
  );
  // The ones leaving back in their places, while they linger.
  const listed = [...sorted];
  for (const { item, at } of [...leaving.values()].sort((a, b) => a.at - b.at))
    if (!listed.some((r) => itemKey(r) === itemKey(item))) listed.splice(Math.min(at, listed.length), 0, item);
  return {
    requests: listed,
    leaving: new Set(leaving.keys()),
    overview: all,
    admin: list.data?.admin ?? false,
    // Whether admin is known yet (the list came, or failed to).
    adminKnown: Boolean(list.data || list.error),
    reload: list.reload,
    requestedKeys: new Set(mine.map(itemKey)),
    loading: list.loading,
    pending,
    error,
    toggle,
  };
}

// TMDB search as you type, debounced; an empty query gives what's trending.
// The abort drops responses for queries that were already typed past.
// Results remember which query they answer, so "loading" is a mismatch.
// on: false asks nothing (Discover's releases view without a search).
export function useDiscover(q: string, on = true) {
  const [results, setResults] = useState<{ q: string; items: Result[]; error: string } | null>(null);
  useEffect(() => {
    if (!on) return;
    const ctrl = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const res = await apiFetch<DiscoverResponse>(`/api/discover?q=${encodeURIComponent(q)}`, {
            signal: ctrl.signal,
          });
          setResults({ q, items: res.items, error: "" });
        } catch (e) {
          if (ctrl.signal.aborted) return;
          setResults({ q, items: [], error: `TMDB search failed: ${(e as Error).message}` });
        }
      },
      q ? 350 : 0,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, on]);
  const loading = on && results?.q !== q;
  return { items: !on || loading ? [] : results!.items, loading, error: on ? (results?.error ?? "") : "" };
}

// showReleases: opens a poster's releases instead of its TMDB page
// (admins only).
type TileContext = {
  pending: Set<string>;
  // Wishlist posters taken off a moment ago, still in sight.
  leaving?: Set<string>;
  toggle: (item: Result, requested: boolean, everyone?: boolean, linger?: boolean) => void;
  showReleases?: (item: Result) => void;
};

// The posters' context on Discover and the Wishlist: the requests, and for
// admins a title's page to open.
export function useTileContext(r: ReturnType<typeof useRequests>) {
  const router = useRouter();
  return { ...r, showReleases: r.admin ? (item: Result) => router.push(titlePath(itemKey(item))) : undefined };
}

// A title page's poster's mark, as on a tile but smaller: the library
// icon when it's owned, else the heart that puts it on the wishlist or
// takes it off (its outline shows while the poster is hovered, as a tile's).
// Goes in a group/card box the poster's size.
export function PosterWish({ item, owned }: { item: Result; owned: boolean }) {
  const r = useRequests();
  if (owned) return <LibraryMark small />;
  const on = r.requestedKeys.has(itemKey(item));
  return (
    <HeartToggle
      small
      on={on}
      title={item.title}
      disabled={r.pending.has(itemKey(item)) || r.loading}
      onClick={() => r.toggle(item, on)}
    />
  );
}

// A poster's wishlist action (Discover's grids, Missing), top right: a
// peach library icon when it's owned, else the heart that toggles it.
export function RequestAction({ item, requested, ctx }: { item: Result; requested: boolean; ctx: TileContext }) {
  if (item.library) return <LibraryMark />;
  return (
    <HeartToggle
      on={requested}
      title={item.title}
      disabled={ctx.pending.has(itemKey(item))}
      onClick={() => ctx.toggle(item, requested)}
    />
  );
}

// A search/trending result.
export function ResultTile({ item, requested, ctx }: { item: Result; requested: boolean; ctx: TileContext }) {
  return (
    <PosterCard
      onClick={ctx.showReleases ? () => ctx.showReleases!(item) : undefined}
      href={ctx.showReleases ? undefined : tmdbUrl(item.mediaType, item.tmdbId)}
      imageSrc={tmdbImage(item.posterPath)}
      title={item.title}
      meta={metaLine(item)}
      action={<RequestAction item={item} requested={requested} ctx={ctx} />}
    />
  );
}

// "Anna, Ben" — who asked, in the order they did.
function requesterNames(item: Request): string {
  return (item.requesters ?? []).map((q) => q.name).join(", ");
}

// One request as a Wishlist poster: the filled heart top right, as on
// Discover, a click takes it off (for everyone in an admin's overview,
// where the info line says who asked); it stays a moment with its heart
// empty, a click puts it back (useRequests' leaving). No library mark: once the library
// has it, it's gone from the list (lib/store/requests.ts).
export function WishlistTile({ item, ctx }: { item: Request; ctx: TileContext }) {
  const overview = Boolean(item.requesters);
  const leaving = ctx.leaving?.has(itemKey(item)) ?? false;
  return (
    <PosterCard
      onClick={ctx.showReleases ? () => ctx.showReleases!(item) : undefined}
      href={ctx.showReleases ? undefined : tmdbUrl(item.mediaType, item.tmdbId)}
      imageSrc={tmdbImage(item.posterPath)}
      title={item.title}
      meta={overview ? [item.year, requesterNames(item)].filter(Boolean).join(" · ") : metaLine(item)}
      action={
        <HeartToggle
          on={!leaving}
          title={item.title}
          everyone={overview}
          disabled={ctx.pending.has(itemKey(item))}
          onClick={() => (leaving ? ctx.toggle(item, false) : ctx.toggle(item, true, overview, true))}
        />
      }
    />
  );
}
