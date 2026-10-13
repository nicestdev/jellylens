import type { MouseEvent } from "react";

export { cn } from "cn";

// A field's quiet focus: the border a step lighter, no ring around it (the
// search boxes, the sign-in form).
export const QUIET_FOCUS = "focus-visible:border-foreground/30 focus-visible:ring-0";

// onMouseEnter for a truncated line: its whole text on hover, only when
// it's cut off (no tooltips otherwise; a Status line, a poster's title).
export function titleIfCut(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  if (el.scrollWidth > el.clientWidth) el.title = el.textContent ?? "";
  else el.removeAttribute("title");
}
