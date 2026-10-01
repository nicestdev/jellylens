import type { ReactNode } from "react";
import { Poster } from "@/components/poster";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "accent" | "destructive" | "success" | "warning";
const BADGE_TONES: Record<BadgeTone, string> = {
  // The translucent neutral badge gets a hairline edge; without it it melts
  // into dark posters and reads smaller than the solid ones.
  neutral: "bg-background/75 text-foreground ring-1 ring-inset ring-white/15",
  accent: "bg-primary/90 text-primary-foreground",
  destructive: "bg-destructive/90 text-background",
  success: "bg-success/90 text-background",
  warning: "bg-warning/90 text-background",
};

const FILTER_STACK = "absolute bottom-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-col items-start gap-1";
// A badge inside a button (group/badge): truncated, primary on hover.
export const CLICKABLE_BADGE =
  "block max-w-full truncate leading-5 transition-colors group-hover/badge:bg-primary group-hover/badge:text-primary-foreground";

// hint shows on hovering the badge itself (the tile's own title is the name).
export type PosterBadge = { label: string; tone?: BadgeTone; hint?: string };

export function CornerBadge({ badge, className }: { badge: PosterBadge; className: string }) {
  return (
    <span
      title={badge.hint}
      className={cn(
        "absolute flex h-5 items-center rounded-md px-1.5 text-[10px] font-semibold whitespace-nowrap backdrop-blur-md",
        BADGE_TONES[badge.tone ?? "neutral"],
        className
      )}
    >
      {badge.label}
    </span>
  );
}

// One tile of a poster grid (Movies, TV Shows): the poster with corner
// badges — top right for the item's own state (4K, Continuing), bottom left
// for how it relates to an active filter (Requests: who released it), top
// left for a count (Requests: how many asked) — then title and a muted info
// line. badge can be several, side by side (Releases: one per quality it
// comes in); filterBadge too, stacked (TV Shows: the languages filtered
// by). The whole
// tile links to href (TMDB), when there is one, or is a button for onClick
// (Releases opens a panel). action is a button over the
// poster's bottom-right corner, kept outside the link so it's valid,
// clickable HTML; with onFilterBadge the filter badges are one too
// (Requests: the releases of the groups they name).
export function PosterCard({
  href,
  onClick,
  itemId,
  imageTag,
  imageSrc,
  title,
  meta,
  badge,
  filterBadge,
  countBadge,
  action,
  onFilterBadge,
  filterBadgeLabel,
}: {
  href?: string;
  onClick?: () => void;
  itemId?: string;
  imageTag?: string;
  imageSrc?: string | null;
  title: string;
  meta?: string;
  badge?: PosterBadge | PosterBadge[];
  filterBadge?: PosterBadge | PosterBadge[];
  countBadge?: PosterBadge;
  action?: ReactNode;
  onFilterBadge?: () => void;
  filterBadgeLabel?: string;
}) {
  const badges = badge ? [badge].flat() : [];
  const filterBadges = filterBadge ? [filterBadge].flat() : [];
  const Tile = href ? "a" : onClick ? "button" : "div";
  const props = href
    ? { href, target: "_blank", rel: "noopener noreferrer" }
    : onClick
      ? { type: "button" as const, onClick }
      : {};
  return (
    <div className="relative min-w-0">
      <Tile
        {...props}
        title={title}
        className={cn("group block w-full text-left outline-none", onClick && "cursor-pointer")}
      >
        <div className="relative">
          <Poster
            itemId={itemId}
            tag={imageTag}
            imageSrc={imageSrc}
            alt=""
            height={480}
            className="w-full rounded-lg transition-shadow group-hover:ring-2 group-hover:ring-primary/60 group-focus-visible:ring-3 group-focus-visible:ring-ring"
          />
          {badges.length ? (
            <div className="absolute top-2 right-2 flex gap-1">
              {badges.map((b) => (
                <CornerBadge key={b.label} badge={b} className="relative" />
              ))}
            </div>
          ) : null}
          {countBadge ? <CornerBadge badge={countBadge} className="top-2 left-2" /> : null}
          {filterBadges.length && !onFilterBadge ? (
            // Stacked; stops short of the action button in the other corner.
            <div className={FILTER_STACK}>
              {filterBadges.map((b) => (
                <CornerBadge key={b.label} badge={b} className="relative block max-w-full truncate leading-5" />
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-2 truncate text-sm font-medium transition-colors group-hover:text-primary">{title}</div>
        {meta ? <div className="truncate text-xs text-muted-foreground">{meta}</div> : null}
      </Tile>
      {action || (filterBadges.length && onFilterBadge) ? (
        // Same box as the poster, so the buttons land on its corners.
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-2/3">
          {filterBadges.length && onFilterBadge ? (
            <button
              type="button"
              onClick={onFilterBadge}
              aria-label={filterBadgeLabel}
              className={cn(FILTER_STACK, "group/badge pointer-events-auto cursor-pointer rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring")}
            >
              {filterBadges.map((b) => (
                <CornerBadge key={b.label} badge={b} className={cn("relative", CLICKABLE_BADGE)} />
              ))}
            </button>
          ) : null}
          {action ? <div className="pointer-events-auto absolute right-2 bottom-2">{action}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export const POSTER_GRID = "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

export function PosterGridSkeleton() {
  return (
    <div className={POSTER_GRID}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-2/3 w-full rounded-lg" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-1.5 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
