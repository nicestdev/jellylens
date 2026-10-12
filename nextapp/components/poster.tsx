"use client";

import { useState } from "react";
import { Tv } from "lucide-react";
import { cn } from "@/lib/utils";

// imageSrc: a poster through Jellylens' own cache (tmdbImage() in
// lib/api-client.ts), so the browser never talks to TMDB; none: the
// placeholder.
export function Poster({ imageSrc, alt, className }: { imageSrc?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : imageSrc;

  return (
    <div
      className={cn("relative aspect-2/3 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border", className)}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- already resized and cached by /api/tmdb-image
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center text-muted-foreground">
          <Tv className="size-4" />
        </div>
      )}
    </div>
  );
}
