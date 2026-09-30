"use client";

import { Fragment } from "react";
import { AlertCircle, Check, EyeOff, MoreHorizontal, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { Poster } from "@/components/poster";
import { CornerBadge } from "@/components/poster-card";
import { itemKey, useRequests } from "@/components/request-tiles";
import { tmdbUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { TONES } from "./shared";

// Only released parts; unreleased ones come in once they're out.
export type CollectionPart = {
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
  owned: boolean;
  fileName?: string;
};
export type MissingCollection = {
  id: string;
  name: string;
  posterPath: string | null;
  count: number;
  parts: CollectionPart[];
};
export type CollectionIgnore = { kind: "collection"; collectionId: string; movieId: number | null };

export function isPartIgnored(ignored: CollectionIgnore[], collectionId: string, movieId: number): boolean {
  return ignored.some((e) => e.collectionId === collectionId && (e.movieId === null || e.movieId === movieId));
}

// A collection's parts that aren't owned, minus ignored ones.
export function missingParts(c: MissingCollection, ignored: CollectionIgnore[]): CollectionPart[] {
  return c.parts.filter((p) => !p.owned && !isPartIgnored(ignored, c.id, p.tmdbId));
}

// TMDB names nearly every collection "… Filmreihe" / "… Collection"; on a
// card that's all collections anyway, the suffix is just noise.
function displayName(name: string): string {
  return name.replace(/[\s-]+(filmreihe|collection|kollektion)$/i, "") || name;
}

function posterSrc(path: string | null): string | null {
  return path ? `https://image.tmdb.org/t/p/w185${path}` : null;
}

const year = (p: CollectionPart) => p.releaseDate?.slice(0, 4) ?? "";

type RequestCtx = {
  requested: Set<string>;
  pending: Set<string>;
  request: (p: CollectionPart) => void;
};

// One part in a collection's strip. Missing ones keep their color (and get
// a red ring); owned or ignored ones fade to gray, the same way the episode
// strip only colors the gaps.
function PartTile({ part, highlight, ctx }: { part: CollectionPart; highlight: boolean; ctx: RequestCtx }) {
  const key = itemKey({ mediaType: "movie", tmdbId: part.tmdbId });
  const requested = ctx.requested.has(key);
  return (
    <div className="relative w-14 shrink-0">
      <a
        href={tmdbUrl("movie", part.tmdbId)}
        target="_blank"
        rel="noopener noreferrer"
        title={`${part.title} (${year(part)}) · ${part.owned ? "owned" : "missing"}`}
        className="group block"
      >
        <Poster
          imageSrc={posterSrc(part.posterPath)}
          alt={part.title}
          className={cn(
            "w-full transition group-hover:opacity-100 group-hover:grayscale-0",
            highlight ? TONES.destructive.ring : "opacity-40 grayscale"
          )}
        />
        <div
          className={cn(
            "mt-1 text-center text-[10px] tabular-nums",
            highlight ? "font-medium text-foreground" : "text-muted-foreground"
          )}
        >
          {year(part)}
        </div>
      </a>
      {highlight ? (
        <button
          type="button"
          title={requested ? "Requested" : `Request ${part.title}`}
          aria-label={requested ? "Requested" : `Request ${part.title}`}
          disabled={requested || ctx.pending.has(key)}
          onClick={() => ctx.request(part)}
          className={cn(
            "absolute top-1 right-1 grid size-5 place-items-center rounded-full shadow-md backdrop-blur-md transition-colors",
            requested
              ? "bg-primary text-primary-foreground"
              : "bg-background/80 text-foreground ring-1 ring-white/15 ring-inset hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
          )}
        >
          {requested ? <Check className="size-3" /> : <Plus className="size-3" />}
        </button>
      ) : null}
    </div>
  );
}

function CollectionCard({
  collection,
  highlighted,
  ctx,
  onIgnore,
}: {
  collection: MissingCollection;
  highlighted: CollectionPart[];
  ctx: RequestCtx;
  onIgnore: (entry: CollectionIgnore) => void;
}) {
  const href = tmdbUrl("collection", collection.id);
  const name = displayName(collection.name);
  const owned = collection.parts.filter((p) => p.owned).length;
  const highlightIds = new Set(highlighted.map((p) => p.tmdbId));
  const fileNames = collection.parts.flatMap((p) => (p.owned && p.fileName ? [p.fileName] : []));
  return (
    <article className="min-w-0 rounded-xl border bg-card p-4">
      <div className="flex gap-4">
        <a href={href} target="_blank" rel="noopener noreferrer" tabIndex={-1} className="group relative shrink-0">
          <Poster
            imageSrc={posterSrc(collection.posterPath)}
            alt=""
            className="w-20 transition-shadow group-hover:ring-2 group-hover:ring-primary/60"
          />
          <CornerBadge
            badge={{ label: `${owned}/${collection.parts.length}`, hint: `${owned} of ${collection.parts.length} owned` }}
            className="top-1.5 right-1.5"
          />
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={collection.name}
                className="block truncate font-medium transition-colors hover:text-primary"
              >
                {name}
              </a>
              <p className="text-xs text-muted-foreground">
                {owned} of {collection.parts.length} owned
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`More options for ${name}`}
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm", className: "-mt-1 -mr-1 text-muted-foreground" }))}
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto max-w-80">
                {highlighted.map((p) => (
                  <DropdownMenuItem
                    key={`ignore-${p.tmdbId}`}
                    onClick={() => onIgnore({ kind: "collection", collectionId: collection.id, movieId: p.tmdbId })}
                  >
                    <EyeOff />
                    <span className="truncate">Ignore {p.title}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => onIgnore({ kind: "collection", collectionId: collection.id, movieId: null })}>
                  <EyeOff />
                  Ignore entire collection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {collection.parts.map((p) => (
              <PartTile key={p.tmdbId} part={p} highlight={highlightIds.has(p.tmdbId)} ctx={ctx} />
            ))}
          </div>
        </div>
      </div>

      {/* The files you have, so the missing parts can come from the same
          release group. Full card width, since it sits below the poster anyway.
          Wrapped, not truncated: the group is at the end — preferably after a
          "." or "-", mid-word only when a piece is too long. */}
      {fileNames.length ? (
        <ul className="mt-3 space-y-0.5 border-t border-border/60 pt-2 font-mono text-[11px] leading-snug [overflow-wrap:anywhere] text-muted-foreground">
          {fileNames.map((f) => (
            <li key={f}>
              {f.split(/(?<=[.\-])/).map((piece, i) => (
                <Fragment key={i}>
                  {piece}
                  <wbr />
                </Fragment>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function IgnoredCollections({
  entries,
  collections,
  onUnignore,
}: {
  entries: CollectionIgnore[];
  collections: MissingCollection[];
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
    (a, b) => name(a.collectionId).localeCompare(name(b.collectionId)) || (a.movieId ?? -1) - (b.movieId ?? -1)
  );

  if (!sorted.length) {
    return <EmptyState icon={EyeOff} title="Nothing ignored" hint="Ignored movies and collections show up here." />;
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {sorted.map((e) => {
        const part = movie(e);
        const poster = e.movieId === null ? byId.get(e.collectionId)?.posterPath : part?.posterPath;
        return (
          <li key={`${e.collectionId}-${e.movieId}`} className="flex items-center gap-3 px-4 py-2.5">
            <Poster imageSrc={posterSrc(poster ?? null)} alt="" className="w-8" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {e.movieId === null ? name(e.collectionId) : (part?.title ?? "Unknown movie")}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {e.movieId === null ? "Entire collection" : name(e.collectionId)}
              </div>
            </div>
            <Button variant="outline" onClick={() => onUnignore(e)}>
              Unignore
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

// The Movies category's cards: TMDB collections you own some of, each with
// the parts you don't have (highlighted: missing and not ignored).
export function CollectionList({
  groups,
  onIgnore,
}: {
  groups: { collection: MissingCollection; parts: CollectionPart[] }[];
  onIgnore: (entry: CollectionIgnore) => void;
}) {
  const requests = useRequests();

  const ctx: RequestCtx = {
    requested: requests.requestedKeys,
    pending: requests.pending,
    request: (p) =>
      requests.toggle(
        {
          mediaType: "movie",
          tmdbId: p.tmdbId,
          title: p.title,
          year: p.releaseDate ? Number(p.releaseDate.slice(0, 4)) : null,
          releaseDate: p.releaseDate,
          posterPath: p.posterPath,
          library: null,
          availability: null,
        },
        false
      ),
  };

  return (
    <>
      {requests.error ? (
        <Alert variant="destructive" className="mb-3">
          <AlertCircle />
          <AlertDescription>{requests.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {groups.map((g) => (
          <CollectionCard key={g.collection.id} collection={g.collection} highlighted={g.parts} ctx={ctx} onIgnore={onIgnore} />
        ))}
      </div>
    </>
  );
}
