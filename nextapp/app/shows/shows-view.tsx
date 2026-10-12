"use client";

import { Tv } from "lucide-react";
import { LibraryPage } from "@/components/library-page";
import { PosterCard } from "@/components/poster-card";
import { apiFetch, tmdbImage, tmdbUrl } from "@/lib/api-client";
import type { ShowsResponse } from "@/lib/api-types";
import { titlePath } from "@/lib/title-path";
import { SORTS, showMeta, showView } from "./logic";

const loadShows = () => apiFetch<ShowsResponse>("/api/shows").then((res) => res.items);

// admin: a poster opens the title's page (its releases and the library's
// copies), for everyone else TMDB's.
export function ShowsView({ admin }: { admin: boolean }) {
  return (
    <LibraryPage
      title="Shows"
      icon={Tv}
      load={loadShows}
      view={showView}
      sorts={SORTS}
      defaultSort="title"
      tile={(item, sortKey) => (
        <PosterCard
          key={item.id}
          href={admin && item.tmdbId ? titlePath(`tv:${item.tmdbId}`) : tmdbUrl("tv", item.tmdbId)}
          imageSrc={tmdbImage(item.posterPath)}
          title={item.name}
          meta={showMeta(item, sortKey)}
          // Only a running show is worth a badge; ended is the usual case.
          badge={item.status === "Continuing" ? { label: "Continuing" } : undefined}
        />
      )}
    />
  );
}
