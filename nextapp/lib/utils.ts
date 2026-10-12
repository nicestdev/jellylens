import type { MouseEvent } from "react";

export { cn } from "cn";

// onMouseEnter for a truncated line: its whole text on hover, only when
// it's cut off (no tooltips otherwise; a Status line, a poster's title).
export function titleIfCut(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  if (el.scrollWidth > el.clientWidth) el.title = el.textContent ?? "";
  else el.removeAttribute("title");
}
