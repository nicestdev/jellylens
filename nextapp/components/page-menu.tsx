import { Fragment } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The ⋯ at the top right of a page (Downloads, Organize) with what acts on
// the page: adding or scanning, then what acts on all of a section (Download
// all, Move all); a line between groups, empty ones left out, so a section's
// heading needs none and doesn't sit over its rows' own ⋯.
export type PageMenuItem = { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean };
export function PageMenu({ groups }: { groups: PageMenuItem[][] }) {
  const shown = groups.filter((g) => g.length);
  return (
    <div className="shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More"
          title="More"
          className={buttonVariants({ variant: "ghost", size: "icon", className: "text-muted-foreground" })}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-40">
          {shown.map((group, i) => (
            <Fragment key={i}>
              {i ? <DropdownMenuSeparator /> : null}
              {group.map(({ icon: Icon, label, onClick, disabled }) => (
                <DropdownMenuItem key={label} onClick={onClick} disabled={disabled}>
                  <Icon />
                  {label}
                </DropdownMenuItem>
              ))}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
