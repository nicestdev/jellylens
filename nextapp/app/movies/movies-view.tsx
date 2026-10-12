"use client";

import { Film } from "lucide-react";
import { LibraryPage } from "@/components/library-page";
import { PosterCard } from "@/components/poster-card";
import { apiFetch, tmdbImage, tmdbUrl } from "@/lib/api-client";
import type { MoviesResponse } from "@/lib/api-types";
import { resolutionLabel } from "@/lib/format";
import { titlePath } from "@/lib/title-path";
import { SORTS, movieMeta, movieView } from "./logic";

const loadMovies = () => apiFetch<MoviesResponse>("/api/movies").then((res) => res.items);

// admin: a poster opens the title's page (its releases and the library's
// copies), for everyone else TMDB's.
export function MoviesView({ admin }: { admin: boolean }) {
  return (
    <LibraryPage
      title="Movies"
      icon={Film}
      load={loadMovies}
      view={movieView}
      sorts={SORTS}
      defaultSort="title"
      tile={(item) => {
        const res = resolutionLabel(item.width, item.height);
        return (
          <PosterCard
            key={item.id}
            href={admin && item.tmdbId ? titlePath(`movie:${item.tmdbId}`) : tmdbUrl("movie", item.tmdbId)}
            imageSrc={tmdbImage(item.posterPath)}
            title={item.name}
            meta={movieMeta(item)}
            // 1080p is the norm, so only the exceptions (4K, 720p, SD) get a badge.
            badge={res && res !== "1080p" ? { label: res } : undefined}
          />
        );
      }}
    />
  );
}
