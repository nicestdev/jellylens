"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
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

// Each tone's color, only on the stripe at the left: green for added (or
// done), peach for waiting on a hand, red for removed or failed, grey for
// plain ones.
const STRIPE: Record<ToastTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
  plain: "bg-muted-foreground",
};

const ACTION =
  "mr-2.5 shrink-0 self-center rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted hover:text-bright";

// Where toast() notes show: bottom right, newest at the bottom. Each one a
// card read like a table's title cell, the title over the description (in
// Mono for a release name), its tone's color only on a thin stripe at the
// left; its action (a link, which also closes it). No ×: they're gone in
// two seconds anyway, five with a link. Hovering or focusing it (its link) holds its time.
// Read out politely by screen readers.
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, () => none);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex w-[calc(100%-2rem)] flex-col items-end gap-2 sm:w-auto"
    >
      {toasts.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          onMouseEnter={() => pauseToast(t.id)}
          onMouseLeave={() => resumeToast(t.id)}
          onFocus={() => pauseToast(t.id)}
          onBlur={() => resumeToast(t.id)}
        />
      ))}
    </div>
  );
}

// One note as the Toaster shows it.
function ToastCard({
  toast: t,
  ...hover
}: {
  toast: Toast;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <div
      role="status"
      {...hover}
      className="pointer-events-auto flex w-full animate-in items-stretch overflow-hidden rounded-md border bg-card text-sm shadow-lg duration-200 fade-in-0 slide-in-from-bottom-2 sm:w-[24rem]"
    >
      <span className={cn("w-1 shrink-0", STRIPE[t.tone])} />
      <div className="min-w-0 flex-1 py-2 pr-3 pl-3">
        <div className="font-medium text-bright">{t.title}</div>
        {t.description ? (
          <div className={cn("text-xs [overflow-wrap:anywhere] text-muted-foreground", t.mono && "font-mono")}>
            {t.description}
          </div>
        ) : null}
      </div>
      {t.action ? (
        <Link href={t.action.href} onClick={() => dismissToast(t.id)} className={ACTION}>
          {t.action.label}
        </Link>
      ) : null}
    </div>
  );
}
