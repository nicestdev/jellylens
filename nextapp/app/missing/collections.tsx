"use client";

import { AlertCircle, EyeOff, MoreHorizontal, SearchX } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { PosterCard } from "@/components/poster-card";
import { useRouter } from "next/navigation";
import { useReleasesChanged } from "@/hooks/use-releases-changed";
import { titlePath } from "@/lib/title-path";
import { RequestAction, itemKey, useRequests, type Result } from "@/components/request-tiles";
import { tmdbImage, tmdbUrl } from "@/lib/api-client";
import type {
  CollectionIgnore,
  CollectionItem as MissingCollection,
  CollectionPartItem as CollectionPart,
} from "@/lib/api-types";
import { releasedHint, releasedLabel } from "@/lib/release-labels";
import { matchesWords } from "@/lib/text";
import { cn } from "@/lib/utils";
import { UnignoreGrid } from "./unignore-table";

// TMDB names nearly every collection "… Filmreihe" / "… Collection"; on a
// tab that's all collections anyway, the suffix is just noise.
function displayName(name: string): string {
  return name.replace(/[\s-]+(filmreihe|collection|kollektion)$/i, "") || name;
}

const yearOf = (p: CollectionPart) => (p.releaseDate ? Number(p.releaseDate.slice(0, 4)) : null);

// One collection, framed: a heading across it (its name, a link to TMDB; at
// the right how many of it you own; ⋯ to ignore a movie or all of it), then
// all its movies as posters in release order, the ones you have (or ignore)
// grayed out. A click opens a movie's releases; a missing one's bottom left
// names the favorite groups that released it, and + requests it.
function CollectionGroup({
  collection,
  parts,
  requests,
  onOpen,
  onIgnore,
}: {
  collection: MissingCollection;
  parts: CollectionPart[];
  requests: ReturnType<typeof useRequests>;
  onOpen: (p: CollectionPart) => void;
  onIgnore: (entry: CollectionIgnore) => void;
}) {
  const name = displayName(collection.name);
  const owned = collection.parts.filter((p) => p.owned);
  // The ones to get; the rest (owned, ignored, not out yet) are grayed out.
  const missing = new Set(parts.map((p) => p.tmdbId));
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <a
          href={tmdbUrl("collection", collection.id)}
          target="_blank"
          rel="noopener noreferrer"
          title={collection.name}
          className="mr-auto min-w-0 truncate text-[13px] font-medium text-foreground transition-colors hover:text-primary"
        >
          {name}
        </a>
        <span className="ml-3 font-num tabular-nums">
          {owned.length}/{collection.parts.length}
        </span>
        <span>owned</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`More options for ${name}`}
            className={cn(
              buttonVariants({
                variant: "ghost",
                size: "icon-xs",
                className: "ml-0.5 text-muted-foreground",
              }),
            )}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto max-w-80">
            {parts.map((p) => (
              <DropdownMenuItem
                key={p.tmdbId}
                onClick={() =>
                  onIgnore({
                    kind: "collection",
                    collectionId: collection.id,
                    movieId: p.tmdbId,
                  })
                }
              >
                <EyeOff />
                <span className="truncate">Ignore {p.title}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onClick={() =>
                onIgnore({
                  kind: "collection",
                  collectionId: collection.id,
                  movieId: null,
                })
              }
            >
              <EyeOff />
              <span className="truncate">Ignore all of {name}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:flex sm:flex-wrap">
        {collection.parts.map((p) => {
          const item = resultOf(p);
          const gap = missing.has(p.tmdbId);
          return (
            <div
              key={p.tmdbId}
              className={cn(
                "min-w-0 transition sm:w-28 sm:shrink-0",
                !gap &&
                  "opacity-40 grayscale focus-within:opacity-100 focus-within:grayscale-0 hover:opacity-100 hover:grayscale-0",
              )}
            >
              <PosterCard
                onClick={() => onOpen(p)}
                imageSrc={tmdbImage(p.posterPath)}
                title={p.title}
                meta={p.releaseDate?.slice(0, 4)}
                filterBadge={
                  gap && p.releaseGroups.length
                    ? {
                        label: releasedLabel(p.releaseGroups),
                        hint: releasedHint(p.releaseGroups),
                      }
                    : undefined
                }
                action={
                  gap ? (
                    <RequestAction item={item} requested={requests.requestedKeys.has(itemKey(item))} ctx={requests} />
                  ) : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// A collection movie as anything requestable is.
const resultOf = (p: CollectionPart): Result => ({
  mediaType: "movie",
  tmdbId: p.tmdbId,
  title: p.title,
  year: yearOf(p),
  releaseDate: p.releaseDate,
  posterPath: p.posterPath,
  library: null,
  availability: null,
});

// The Collections tab: the TMDB collections you own some of, each with the
// movies you don't have (missing and not ignored), a row each that wraps
// as needed; a poster opens its title page. onReleasesChanged: a match
// was fixed there, so which groups released what may have changed.
export function CollectionList({
  groups,
  onIgnore,
  onReleasesChanged,
}: {
  groups: { collection: MissingCollection; parts: CollectionPart[] }[];
  onIgnore: (entry: CollectionIgnore) => void;
  onReleasesChanged: () => void;
}) {
  const requests = useRequests();
  const router = useRouter();
  useReleasesChanged(onReleasesChanged);

  return (
    <>
      {requests.error ? (
        <Alert variant="destructive" className="mb-3">
          <AlertCircle />
          <AlertDescription>{requests.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <CollectionGroup
            key={g.collection.id}
            collection={g.collection}
            parts={g.parts}
            requests={requests}
            onOpen={(p) => router.push(titlePath(itemKey(resultOf(p))))}
            onIgnore={onIgnore}
          />
        ))}
      </div>
    </>
  );
}

// The Collections tab's Ignored list: a movie, or a whole collection.
export function IgnoredCollections({
  entries,
  collections,
  query,
  onUnignore,
}: {
  entries: CollectionIgnore[];
  collections: MissingCollection[];
  query: string; // narrows it by movie or collection name
  onUnignore: (entry: CollectionIgnore) => void;
}) {
  const byId = new Map(collections.map((c) => [c.id, c]));
  // A collection that's complete now is no longer in the list, so its name
  // isn't known anymore; the ignore entry is harmless until it's removed.
  const name = (id: string) => {
    const c = byId.get(id);
    return c ? displayName(c.name) : "Complete collection";
  };
  const movie = (e: CollectionIgnore) => byId.get(e.collectionId)?.parts.find((p) => p.tmdbId === e.movieId);
  const sorted = [...entries].sort(
    (a, b) => name(a.collectionId).localeCompare(name(b.collectionId)) || (a.movieId ?? -1) - (b.movieId ?? -1),
  );
  const matches = matchesWords(query);
  const tiles = sorted
    .map((e) => {
      const collection = byId.get(e.collectionId);
      const part = movie(e);
      return {
        key: `${e.collectionId}-${e.movieId}`,
        title: e.movieId === null ? name(e.collectionId) : (part?.title ?? "Unknown movie"),
        meta: e.movieId === null ? undefined : name(e.collectionId),
        imageSrc: tmdbImage(e.movieId === null ? collection?.posterPath : part?.posterPath),
        filterBadge: e.movieId === null ? { label: "All" } : undefined,
        onUnignore: () => onUnignore(e),
      };
    })
    .filter((t) => matches(`${t.title} ${t.meta ?? ""}`));

  if (!sorted.length) {
    return <EmptyState icon={EyeOff} title="Nothing ignored" hint="Ignored movies and collections show up here." />;
  }
  if (!tiles.length) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nothing found"
        hint={`No ignored movie or collection matches “${query.trim()}”.`}
      />
    );
  }

  return <UnignoreGrid tiles={tiles} />;
}
