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

// One tile of a poster grid (Movies, TV Shows): the poster with up to two
// corner badges — top right for the item's own state (4K, Continuing), bottom
// left for how it relates to an active filter — then title and a muted info
// line. The whole tile is a link. action is a button over the poster's
// bottom-right corner, kept outside the link so it's valid, clickable HTML.
export function PosterCard({
  href,
  itemId,
  imageTag,
  imageSrc,
  title,
  meta,
  badge,
  filterBadge,
  action,
}: {
  href: string;
  itemId?: string;
  imageTag?: string;
  imageSrc?: string | null;
  title: string;
  meta?: string;
  badge?: PosterBadge;
  filterBadge?: PosterBadge;
  action?: ReactNode;
}) {
  return (
    <div className="relative min-w-0">
      <a href={href} target="_blank" rel="noopener noreferrer" title={title} className="group block outline-none">
        <div className="relative">
          <Poster
            itemId={itemId}
            tag={imageTag}
            imageSrc={imageSrc}
            alt=""
            height={480}
            className="w-full rounded-lg transition-shadow group-hover:ring-2 group-hover:ring-primary/60 group-focus-visible:ring-3 group-focus-visible:ring-ring"
          />
          {badge ? <CornerBadge badge={badge} className="top-2 right-2" /> : null}
          {filterBadge ? <CornerBadge badge={filterBadge} className="bottom-2 left-2" /> : null}
        </div>
        <div className="mt-2 truncate text-sm font-medium transition-colors group-hover:text-primary">{title}</div>
        {meta ? <div className="truncate text-xs text-muted-foreground">{meta}</div> : null}
      </a>
      {action ? (
        // Same box as the poster, so the button lands on its corner.
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-2/3">
          <div className="pointer-events-auto absolute right-2 bottom-2">{action}</div>
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
