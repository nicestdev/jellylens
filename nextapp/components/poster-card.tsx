import type { ReactNode } from "react";
import { Poster } from "@/components/poster";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// The translucent badge gets a hairline edge; without it it melts into
// dark posters and reads smaller than it is.
const BADGE =
  "absolute flex h-5 items-center rounded-md bg-background/75 px-1.5 text-[10px] font-semibold whitespace-nowrap text-foreground ring-1 ring-white/15 backdrop-blur-md ring-inset";

// hint shows on hovering the badge itself (the tile's own title is the name).
export type PosterBadge = { label: string; hint?: string };

function CornerBadge({ badge, className }: { badge: PosterBadge; className: string }) {
  return (
    <span title={badge.hint} className={cn(BADGE, className)}>
      {badge.label}
    </span>
  );
}

// One tile of a poster grid: the poster with up to three corner badges —
// badge top right for the item's own state (4K, Continuing), leftBadge top
// left for what's off about it (Missing: the episodes), filterBadge bottom
// left (Wishlist: who wants it) — then title and a muted info line. The
// whole tile links to href (TMDB), when there is one, or is a button for
// onClick (a title page). action is a button over the poster's
// bottom-right corner, kept outside the link so it's valid, clickable HTML.
export function PosterCard({
  href,
  onClick,
  itemId,
  imageTag,
  imageSrc,
  title,
  meta,
  badge,
  leftBadge,
  filterBadge,
  action,
}: {
  href?: string;
  onClick?: () => void;
  itemId?: string;
  imageTag?: string;
  imageSrc?: string | null;
  title: string;
  meta?: string;
  badge?: PosterBadge;
  leftBadge?: PosterBadge;
  filterBadge?: PosterBadge;
  action?: ReactNode;
}) {
  const Tile = href ? "a" : onClick ? "button" : "div";
  const props = href
    ? { href, target: "_blank", rel: "noopener noreferrer" }
    : onClick
      ? { type: "button" as const, onClick }
      : {};
  return (
    // group/card: the action can show on hovering anywhere on the tile.
    <div className="group/card relative min-w-0">
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
            className="w-full rounded-lg transition-shadow group-hover:ring-2 group-hover:ring-foreground/40 group-focus-visible:ring-3 group-focus-visible:ring-ring"
          />
          {leftBadge ? (
            // Stops short of a top-right badge (a quality); alone it takes the
            // poster's width and wraps rather than cut what's missing short.
            <CornerBadge
              badge={leftBadge}
              className={cn(
                "top-2 left-2 block",
                badge
                  ? "max-w-[calc(100%-3.5rem)] truncate leading-5"
                  : "h-auto max-w-[calc(100%-1rem)] py-0.5 leading-4 whitespace-normal",
              )}
            />
          ) : null}
          {badge ? <CornerBadge badge={badge} className="top-2 right-2" /> : null}
          {filterBadge ? (
            // Stops short of the action button in the other corner.
            <CornerBadge
              badge={filterBadge}
              className="bottom-2 left-2 block max-w-[calc(100%-5rem)] truncate leading-5"
            />
          ) : null}
        </div>
        <div className="mt-2 truncate text-sm font-medium">{title}</div>
        {meta ? <div className="truncate text-xs text-muted-foreground">{meta}</div> : null}
      </Tile>
      {action ? (
        // Same box as the poster, so the button lands on its corner; the
        // action places itself (a corner, or a ribbon off the top edge).
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-2/3">{action}</div>
      ) : null}
    </div>
  );
}

// Three across on phones, like Missing's posters, with tighter gaps there.
export const POSTER_GRID =
  "grid grid-cols-3 gap-x-3 gap-y-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

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
