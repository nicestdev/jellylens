import type { SVGProps } from "react";

// The design canvas's own icons (24×24 strokes), drawn as it draws them, so
// they take the size and stroke width given like lucide's do.
type IconProps = SVGProps<SVGSVGElement> & { strokeWidth?: number };

function icon(d: string, label: string) {
  function Icon({ strokeWidth = 1.6, ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        <path d={d} />
      </svg>
    );
  }
  Icon.displayName = label;
  return Icon;
}

export const SearchIcon = icon("M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M16 16l4 4", "SearchIcon");
export const ChevronDownIcon = icon("M6 9l6 6 6-6", "ChevronDownIcon");
export const SortIcon = icon("M7 4v16M3 16l4 4 4-4M14 6h7M14 12h5M14 18h3", "SortIcon");
