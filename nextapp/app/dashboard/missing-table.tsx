"use client";

import { EyeOff, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CELL,
  iconButton,
  MENU_CELL,
  MUTED_CELL,
  NOT_ON_PHONE,
  NUMBER_CELL,
  PHONE_MENU,
  ROW,
  TITLE_CELL,
  type Column,
} from "@/components/library-table";
import { TableFrame } from "@/components/section-frame";
import type { IgnoreEntry, MissingSeason, ShowItem } from "@/lib/api-types";
import { plural, seasonCode, seasonLabel, showName } from "@/lib/format";
import { titlePath } from "@/lib/title-path";
import { cn } from "@/lib/utils";
import type { MissingShow } from "./logic";

const showPath = (item: ShowItem) => titlePath(`tv:${item.id}`);

// A season's episodes as dots: a square per episode TMDB knows, red when
// missing, outlined when not aired yet, plain when owned.
function EpisodeDots({ season }: { season: MissingSeason }) {
  const states = season.episodeStates.length
    ? season.episodeStates
    : Array.from({ length: season.count }, (_, i) => ({ n: i + 1, state: "missing" as const }));
  return (
    <div className="flex flex-wrap gap-0.5 whitespace-normal">
      {states.map((e) => (
        <span
          key={e.n}
          aria-hidden
          className={cn(
            "size-2.5 rounded-[2px]",
            e.state === "owned" && "bg-muted-foreground/45",
            e.state === "missing" && "bg-destructive/60",
            e.state === "upcoming" && "ring-1 ring-muted-foreground/50 ring-inset",
          )}
        />
      ))}
    </div>
  );
}

// A season's ⋯: ignore the season, or the whole show.
function IgnoreMenu({
  item,
  season,
  onIgnore,
}: {
  item: ShowItem;
  season: number;
  onIgnore: (entry: IgnoreEntry) => void;
}) {
  const ignore = (s: number | null) => onIgnore({ showId: item.id, season: s });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`More for ${item.name} ${seasonLabel(season)}`} className={iconButton}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuItem onClick={() => ignore(season)}>
          <EyeOff />
          Ignore {seasonLabel(season).toLowerCase()}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ignore(null)}>
          <EyeOff />
          Ignore entire show
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const missingColumns: Column[] = [
  { label: "Title" },
  { label: "Season", width: "w-20", phone: false },
  { label: "Episodes", width: "w-64", phone: false },
  { label: "Missing", align: "right", width: "w-20", phone: false },
  { label: "Actions", hidden: true, width: "w-14", phone: false },
];

// Every season with episodes missing, a row each (the shows' order:
// most missing first): the show, the season, its episodes as dots, how
// many are missing, and its ⋯. On a phone the season and dots go under
// the title.
export function MissingTable({
  shows,
  loading,
  onIgnore,
}: {
  shows: MissingShow[];
  loading: boolean;
  onIgnore: (entry: IgnoreEntry) => void;
}) {
  const episodes = shows.reduce((sum, s) => sum + s.count, 0);
  const rows = shows.flatMap((s) => s.seasons.map((season) => ({ item: s.item, season })));
  return (
    <TableFrame
      title="Missing shows"
      count={shows.length ? `${shows.length} · ${plural(episodes, "episode")}` : loading ? undefined : 0}
      columns={missingColumns}
      minWidth="sm:min-w-[36rem]"
      busy={loading}
    >
      {rows.length ? (
        rows.map(({ item, season }) => {
          const menu = <IgnoreMenu item={item} season={season.season} onIgnore={onIgnore} />;
          return (
            <tr key={`${item.id}-${season.season}`} className={cn(ROW, "h-auto")}>
              <td className={cn(TITLE_CELL, "py-2")}>
                <div className="flex items-center gap-2">
                  <Link href={showPath(item)} className="min-w-0 flex-1 truncate font-medium">
                    {showName(item)}
                  </Link>
                  <span className="text-muted-foreground tabular-nums sm:hidden">{season.count}</span>
                  <span className={PHONE_MENU}>{menu}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 sm:hidden">
                  <span className="w-7 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {seasonCode(season.season)}
                  </span>
                  <EpisodeDots season={season} />
                </div>
              </td>
              <td className={cn(MUTED_CELL, "py-2", NOT_ON_PHONE)}>{seasonCode(season.season)}</td>
              <td className={cn(CELL, "py-2", NOT_ON_PHONE)}>
                <EpisodeDots season={season} />
              </td>
              <td className={cn(NUMBER_CELL, "py-2", NOT_ON_PHONE)}>{season.count}</td>
              <td className={MENU_CELL}>{menu}</td>
            </tr>
          );
        })
      ) : (
        <tr className={ROW}>
          <td colSpan={5} className={MUTED_CELL}>
            {loading ? "Loading" : "Nothing missing"}
          </td>
        </tr>
      )}
    </TableFrame>
  );
}
