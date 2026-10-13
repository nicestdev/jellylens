"use client";

import Link from "next/link";
import { MUTED_CELL, NOT_ON_PHONE, NUMBER_CELL, ROW, TITLE_CELL, type Column } from "@/components/library-table";
import { Dot } from "@/components/dot";
import { TableFrame } from "@/components/section-frame";
import type { MissingSeason, ShowItem } from "@/lib/api-types";
import { seasonCode } from "@/lib/format";
import { titlePath } from "@/lib/title-path";
import { cn } from "@/lib/utils";
import type { MissingShow } from "./logic";

const showPath = (item: ShowItem) => titlePath(`tv:${item.id}`);

// A season's episodes as dots: a square per episode TMDB knows, red when
// missing, outlined when not aired yet, plain when owned.
const statesOf = (season: MissingSeason) =>
  season.episodeStates.length
    ? season.episodeStates
    : Array.from({ length: season.count }, (_, i) => ({ n: i + 1, state: "missing" as const }));

// As many a line as the cell has room for, a long season wrapping into a block.
function EpisodeDots({ season }: { season: MissingSeason }) {
  const states = statesOf(season);
  return (
    <div className="flex flex-wrap gap-0.5">
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

// Every season with episodes missing, a row each (the shows' order: most
// missing first): the show with its episodes as dots under it (as many a
// line as the title's column has room for), the season, how many are
// missing. On a phone the season follows the name ("Scrubs · S01"), the dots
// under it, the count left out (the red dots say it).
const columns: Column[] = [
  { label: "Title" },
  { label: "Season", align: "right", width: "w-17", phone: false },
  { label: "Missing", align: "right", width: "w-19", phone: false },
];

export function MissingTable({ shows }: { shows: MissingShow[] }) {
  const rows = shows.flatMap((s) => s.seasons.map((season) => ({ item: s.item, season })));
  // Only with something in it.
  if (!rows.length) return null;
  return (
    <TableFrame title="Incomplete shows" count={shows.length} columns={columns} minWidth="min-w-0">
      {rows.map(({ item, season }) => (
        <tr key={`${item.id}-${season.season}`} className={cn(ROW, "h-auto")}>
          <td className={cn(TITLE_CELL, "py-2")}>
            <div className="flex items-baseline gap-1.5">
              <Link href={showPath(item)} className="min-w-0 truncate font-medium">
                {item.name}
              </Link>
              {/* On a phone the season follows the name. */}
              <span className="flex shrink-0 gap-1.5 text-muted-foreground sm:hidden">
                <Dot />
                {seasonCode(season.season)}
              </span>
            </div>
            <div className="mt-1.5">
              <EpisodeDots season={season} />
            </div>
          </td>
          <td className={cn(MUTED_CELL, "py-2 text-right", NOT_ON_PHONE)}>{season.season}</td>
          <td className={cn(NUMBER_CELL, "py-2", NOT_ON_PHONE)}>{season.count}</td>
        </tr>
      ))}
    </TableFrame>
  );
}
