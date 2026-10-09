"use client";

import { Eye } from "lucide-react";
import { PosterCard, type PosterBadge } from "@/components/poster-card";

// itemId + imageTag: a Jellyfin poster (shows); imageSrc: TMDB's (movies,
// collections); neither: the placeholder.
type IgnoredTile = {
  key: string;
  title: string;
  meta?: string;
  badge?: PosterBadge;
  filterBadge?: PosterBadge;
  itemId?: string;
  imageTag?: string;
  imageSrc?: string | null;
  onUnignore: () => void;
};

// The eye in the poster's bottom-right corner, where other posters have
// their wishlist badge: brings it back to Missing. Shown while the tile
// is hovered, always on touch screens.
function UnignoreButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title="Unignore"
      aria-label={`Unignore ${title}`}
      onClick={onClick}
      className="pointer-events-auto absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-background/75 text-foreground opacity-0 shadow-md ring-1 ring-white/15 backdrop-blur-md transition ring-inset group-hover/card:opacity-100 hover:bg-primary hover:text-primary-foreground focus-visible:opacity-100 pointer-coarse:opacity-100"
    >
      <Eye className="size-4" />
    </button>
  );
}

// Missing's Ignored view, for shows and collections alike: what's ignored
// as posters, sized like Missing's own (three across on phones).
export function UnignoreGrid({ tiles }: { tiles: IgnoredTile[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:flex sm:flex-wrap">
      {tiles.map(({ key, onUnignore, ...t }) => (
        <div key={key} className="min-w-0 sm:w-28 sm:shrink-0">
          <PosterCard {...t} action={<UnignoreButton title={t.title} onClick={onUnignore} />} />
        </div>
      ))}
    </div>
  );
}
