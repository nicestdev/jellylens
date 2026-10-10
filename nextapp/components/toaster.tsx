"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Info, MinusCircle, X, type LucideIcon } from "lucide-react";
import {
  SHOWN_MS,
  dismissToast,
  getToasts,
  pauseToast,
  resumeToast,
  subscribeToasts,
  type Toast,
  type ToastTone,
} from "@/lib/toast";
import { cn } from "@/lib/utils";

const none: Toast[] = [];

// Each tone's color, only on its icon badge and countdown: green for
// added (or done), red for removed or failed, grey for plain ones. The card itself is a menu's.
const LOOK: Record<ToastTone, { icon: LucideIcon; badge: string; bar: string }> = {
  success: { icon: CheckCircle2, badge: "bg-success/15 text-success", bar: "bg-success" },
  removed: { icon: MinusCircle, badge: "bg-destructive/15 text-destructive", bar: "bg-destructive" },
  error: { icon: AlertCircle, badge: "bg-destructive/15 text-destructive", bar: "bg-destructive" },
  plain: { icon: Info, badge: "bg-muted text-muted-foreground", bar: "bg-muted-foreground" },
};

const ACTION = "shrink-0 rounded px-1.5 py-1 font-semibold text-primary transition-colors hover:text-foreground";
const countdown = { animationDuration: `${SHOWN_MS}ms` };

// Where toast() notes show: top right, newest at the top. Each one a
// popover-like card with its tone's icon in a tinted badge, the title over
// the description, its action (a link or a button, which also closes it)
// and a ×. A bar along its foot counts down the time it has left (for
// Undo, the time left to take it back); hovering holds it. Read out
// politely by screen readers.
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, () => none);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-4 right-4 z-50 flex w-[calc(100%-2rem)] flex-col items-end gap-2 sm:w-auto"
    >
      {[...toasts].reverse().map((t) => {
        const look = LOOK[t.tone];
        const Icon = t.icon ?? look.icon;
        return (
          <div
            key={t.id}
            role="status"
            onMouseEnter={() => pauseToast(t.id)}
            onMouseLeave={() => resumeToast(t.id)}
            className="group pointer-events-auto relative flex w-full animate-in items-center gap-2.5 overflow-hidden rounded-lg border bg-popover py-2.5 pr-2 pl-2.5 text-sm text-popover-foreground shadow-lg duration-200 fade-in-0 slide-in-from-top-2 sm:w-[22rem]"
          >
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", look.badge)}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{t.title}</div>
              {t.description ? <div className="truncate text-muted-foreground">{t.description}</div> : null}
            </div>
            {t.action?.href ? (
              <Link href={t.action.href} onClick={() => dismissToast(t.id)} className={ACTION}>
                {t.action.label}
              </Link>
            ) : t.action ? (
              <button
                type="button"
                onClick={() => {
                  dismissToast(t.id);
                  t.action?.onClick?.();
                }}
                className={ACTION}
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismissToast(t.id)}
              className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
            <span
              style={countdown}
              className={cn(
                "absolute inset-x-0 bottom-0 h-0.5 origin-left animate-[toast-bar_linear_forwards] group-hover:[animation-play-state:paused] motion-reduce:hidden",
                look.bar,
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
