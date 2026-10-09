"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartMinus, HeartPlus } from "lucide-react";
import { PosterCard } from "@/components/poster-card";
import { REQUESTS_CHANGED, apiFetch, tmdbImage, tmdbUrl, jsonRequest } from "@/lib/api-client";
import type { DiscoverItem, DiscoverResponse, RequestItem as Request, RequestsResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { releasedHint, releasedLabel } from "@/lib/release-labels";
import { titlePath } from "@/lib/title-path";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type MediaType = "movie" | "tv";

// Anything that can be requested: a search or trending result, a request,
// or a collection's missing part. library: already in Jellyfin (by TMDB
// id). availability: how far along its release is when it isn't fully out
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

// A poster's corner badge, like its own (S01·E9–10, 1080p): the wishlist
// toggle and the In library mark.
const CORNER_BADGE =
  "flex h-5 items-center rounded-md bg-background/75 px-1.5 text-[10px] font-semibold whitespace-nowrap text-foreground ring-1 ring-white/15 backdrop-blur-md ring-inset";

// A poster's In library mark: a corner badge with nothing to click.
function LibraryMark({ className = "absolute right-2 bottom-2" }: { className?: string }) {
  return <span className={cn(CORNER_BADGE, className)}>In library</span>;
}

// A poster's wishlist toggle, a badge in its bottom-right corner:
// "+ Wishlist" puts the title on the wishlist; once there it reads
// "Wishlisted", and a click takes it off again (Undo in the note). Off the wishlist it only shows while the tile is
// hovered or the button focused, except on touch screens, which can't
// hover; on it, it always shows, as the poster's wishlist state. The rest of the poster
// still opens the title.
// everyone: it takes it off everyone's (the Wishlist's overview).
function WishlistToggle({
  on,
  everyone = false,
  disabled,
  onClick,
  className = "absolute right-2 bottom-2",
}: {
  on: boolean;
  everyone?: boolean;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const label = on ? (everyone ? "Remove for everyone" : "Remove from wishlist") : "Add to wishlist";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // Styled like the poster's own corner badges (S01·E9–10, 1080p).
        "pointer-events-auto transition hover:bg-sidebar-accent disabled:opacity-60",
        CORNER_BADGE,
        className,
        !on && "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
      )}
    >
      {on ? "Wishlisted" : "+ Wishlist"}
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
  const error = actionError || (list.error && `Failed to load the wishlist: ${list.error}`);

  // everyone: an admin removing the request for all who asked.
  async function toggle(item: Result, requested: boolean, everyone = false) {
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
      list.setData(res);
      window.dispatchEvent(new CustomEvent(REQUESTS_CHANGED, { detail: res }));
      setError("");
      // A note that it worked: to see the list, or to take it back (not for
      // a removal for everyone, which one request can't restore).
      const description = item.year ? `${item.title} (${item.year})` : item.title;
      if (!requested)
        toast("Added to your wishlist", {
          description,
          tone: "success",
          icon: HeartPlus,
          action: { label: "View", href: "/wishlist" },
        });
      else if (everyone) toast("Removed for everyone", { description, tone: "removed", icon: HeartMinus });
      else
        toast("Removed from your wishlist", {
          description,
          tone: "removed",
          icon: HeartMinus,
          action: { label: "Undo", onClick: () => void toggle(item, false) },
        });
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
      Number(Boolean(b.library)) - Number(Boolean(a.library)) ||
      (b.requesters?.length ?? 0) - (a.requesters?.length ?? 0) ||
      latestRequest(b).localeCompare(latestRequest(a)),
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
    const timer = setTimeout(
      async () => {
        try {
          const res = await apiFetch<DiscoverResponse>(`/api/discover?q=${encodeURIComponent(q)}`, {
            signal: ctrl.signal,
          });
          setResults({ q, items: res.Items, error: "" });
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

// The posters' context on Discover and the Wishlist: the requests, and for
// admins a title's page to open.
export function useTileContext(r: ReturnType<typeof useRequests>) {
  const router = useRouter();
  return { ...r, showReleases: r.admin ? (item: Result) => router.push(titlePath(itemKey(item))) : undefined };
}

// A poster's wishlist action (Discover's grid, Releases, Missing): In
// library bottom right when it's owned, else the wishlist toggle there.
export function RequestAction({ item, requested, ctx }: { item: Result; requested: boolean; ctx: TileContext }) {
  if (item.library) return <LibraryMark />;
  return (
    <WishlistToggle
      on={requested}
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

// One request as a Wishlist poster: the favorite groups that released it
// bottom left, In library and Wishlisted bottom right (a click takes it
// off, for everyone in an admin's overview, where the info line says who
// asked).
export function WishlistTile({ item, ctx }: { item: Request; ctx: TileContext }) {
  const overview = Boolean(item.requesters);
  return (
    <PosterCard
      onClick={ctx.showReleases ? () => ctx.showReleases!(item) : undefined}
      href={ctx.showReleases ? undefined : tmdbUrl(item.mediaType, item.tmdbId)}
      imageSrc={tmdbImage(item.posterPath)}
      title={item.title}
      meta={overview ? [item.year, requesterNames(item)].filter(Boolean).join(" · ") : metaLine(item)}
      filterBadge={
        item.releaseGroups.length && !item.library
          ? { label: releasedLabel(item.releaseGroups), hint: releasedHint(item.releaseGroups) }
          : undefined
      }
      action={
        <>
          {/* Side by side in the corner, the mark before the toggle. */}
          <div className="absolute right-2 bottom-2 flex gap-1">
            {item.library ? <LibraryMark className="" /> : null}
            <WishlistToggle
              on
              everyone={overview}
              disabled={ctx.pending.has(itemKey(item))}
              onClick={() => ctx.toggle(item, true, overview)}
              className=""
            />
          </div>
        </>
      }
    />
  );
}
