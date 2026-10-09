"use client";

import { useState } from "react";
import { Tv } from "lucide-react";
import { cn } from "@/lib/utils";

// Library images go through Jellylens' own cache (/api/image), so the browser
// never needs to reach Jellyfin; the tag makes the URL cache-bust on change.
// Items not in the library (TMDB results) pass a ready-made imageSrc instead.
export function Poster({
  itemId = "",
  tag,
  imageSrc,
  alt,
  className,
  height = 240,
}: {
  itemId?: string;
  tag?: string;
  imageSrc?: string | null;
  alt: string;
  className?: string;
  height?: number; // requested image height in px; raise it for large tiles
}) {
  const [failed, setFailed] = useState(false);
  const src = failed
    ? null
    : imageSrc !== undefined
      ? imageSrc
      : itemId && tag
        ? `/api/image/${itemId}?tag=${tag}&h=${height}`
        : null;

  return (
    <div
      className={cn("relative aspect-2/3 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border", className)}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- already resized and cached by /api/image or TMDB
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center text-muted-foreground">
          <Tv className="size-4" />
        </div>
      )}
    </div>
  );
}
