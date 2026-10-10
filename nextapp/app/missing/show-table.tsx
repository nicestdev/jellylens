"use client";

import { EyeOff, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PosterCard, type PosterBadge } from "@/components/poster-card";
import type { IgnoreKind, ShowIgnore, ShowItem } from "@/lib/api-types";
import { tmdbImage } from "@/lib/api-client";
import { seasonCode } from "@/lib/format";
import { titlePath } from "@/lib/title-path";
import { episodeRanges, type Group, type Line } from "./logic";

// The poster's one badge, short enough for a phone: the season and its
// missing episodes ("S01·E9–10"), just the season when all of it is
// missing or TMDB doesn't list it (the hint and the section say which).
export function gapLabel(line: Line): string {
  const season = seasonCode(line.season);
  return line.extraSeason || line.wholeSeason ? season : `${season}·${episodeRanges(line.episodes)}`;
}

// The gap badge's hint: what's missing in full.
function gapHint(line: Line, kind: IgnoreKind): string {
  return line.extraSeason
    ? `Season ${line.season} isn't on TMDB`
    : line.wholeSeason
      ? `All ${line.count} of season ${line.season} missing`
      : `${line.count} ${kind === "mismatch" ? "not on TMDB" : "missing"}: ${gapLabel(line)}`;
}

// ⋯ in the poster's bottom-right corner, a corner badge like the other
// posters' wishlist one: ignore this season or the whole show. Shown while
// the tile is hovered, always on touch screens.
function IgnoreMenu({
  item,
  season,
  kind,
  onIgnore,
}: {
  item: ShowItem;
  season: number;
  kind: IgnoreKind;
  onIgnore: (entry: ShowIgnore) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`More options for ${item.Name}`}
        className="pointer-events-auto absolute right-2 bottom-2 flex h-5 items-center rounded-md bg-background/75 px-1.5 text-foreground opacity-0 ring-1 ring-white/15 backdrop-blur-md transition ring-inset group-hover/card:opacity-100 hover:bg-sidebar-accent focus-visible:opacity-100 data-[popup-open]:bg-sidebar-accent data-[popup-open]:opacity-100 pointer-coarse:opacity-100"
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuItem onClick={() => onIgnore({ kind, seriesId: item.Id, season })}>
          <EyeOff />
          Ignore season {season}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onIgnore({ kind, seriesId: item.Id, season: null })}>
          <EyeOff />
          Ignore entire show
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// A category's shows as posters, one per season: one badge top left with
// the season and what's missing of it (S01.E9–10), the year in the info line. A click opens the show's title page
// with its releases.
export function ShowList({
  groups,
  kind,
  onIgnore,
}: {
  groups: Group[];
  kind: IgnoreKind;
  onIgnore: (entry: ShowIgnore) => void;
}) {
  const router = useRouter();
  return (
    // Sized like Missing Movies' posters: three across on phones.
    <div className="grid grid-cols-3 gap-3 sm:flex sm:flex-wrap">
      {groups.flatMap(({ item, lines }) =>
        lines.map((line) => {
          const tmdb = item.ProviderIds?.Tmdb;
          const gap: PosterBadge = { label: gapLabel(line), hint: gapHint(line, kind) };
          return (
            <div key={`${item.Id}-${line.season}-${line.episodes}`} className="min-w-0 sm:w-28 sm:shrink-0">
              <PosterCard
                onClick={tmdb ? () => router.push(titlePath(`tv:${tmdb}`)) : undefined}
                imageSrc={tmdbImage(item.PosterPath)}
                title={item.Name}
                meta={item.ProductionYear ? String(item.ProductionYear) : undefined}
                leftBadge={gap}
                action={<IgnoreMenu item={item} season={line.season} kind={kind} onIgnore={onIgnore} />}
              />
            </div>
          );
        }),
      )}
    </div>
  );
}
