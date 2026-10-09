"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

// Loads the next page when the end of a list scrolls near: a marker under
// it, watched while nothing is loading. shown: how many are listed; watching
// anew after each page checks again, so a page that doesn't fill the screen
// loads the one after right away. Render it only while there's more.
export function LoadMore({ shown, onMore, loading = false }: { shown: number; onMore: () => void; loading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMoreRef = useRef(onMore);
  useEffect(() => {
    onMoreRef.current = onMore;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onMoreRef.current();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown, loading]);

  return (
    <div ref={ref} className="mt-6 flex h-8 justify-center text-muted-foreground">
      {loading ? <Loader2 className="size-5 animate-spin" /> : null}
    </div>
  );
}
