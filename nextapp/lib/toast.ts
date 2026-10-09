import type { LucideIcon } from "lucide-react";

// Short notes that pop up top right and go away by themselves
// (components/toaster.tsx shows them): toast("Added to your wishlist", {
// description: "Heat", tone: "success", action: { label: "View", href:
// "/wishlist" } }), the title bold and the description on a line of its
// own. tone colors it: success
// (green), removed (red), or plain. At most three at a time, the oldest
// dropped first.

type ToastAction = { label: string; href?: string; onClick?: () => void };
export type ToastTone = "success" | "removed" | "plain";
// icon: in place of the tone's own (Wishlist: a bookmark).
export type Toast = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  icon?: LucideIcon;
  action?: ToastAction;
};

export const SHOWN_MS = 2000;
const MAX = 3;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
// Each note's countdown: running (handle) until its end, or held with the
// time it had left.
const timers = new Map<number, { handle: ReturnType<typeof setTimeout> | null; ends: number; left: number }>();

function emit() {
  listeners.forEach((l) => l());
}

function countDown(id: number, ms: number) {
  timers.set(id, { handle: setTimeout(() => dismissToast(id), ms), ends: Date.now() + ms, left: ms });
}

function forget(id: number) {
  const timer = timers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  timers.delete(id);
}

export function dismissToast(id: number) {
  forget(id);
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function pauseToast(id: number) {
  const timer = timers.get(id);
  if (!timer?.handle) return;
  clearTimeout(timer.handle);
  timer.handle = null;
  timer.left = Math.max(0, timer.ends - Date.now());
}

export function resumeToast(id: number) {
  const timer = timers.get(id);
  if (timer && !timer.handle) countDown(id, timer.left);
}

export function toast(
  title: string,
  {
    description,
    tone = "plain",
    icon,
    action,
  }: { description?: string; tone?: ToastTone; icon?: LucideIcon; action?: ToastAction } = {},
) {
  const t = { id: nextId++, title, description, tone, icon, action };
  const all = [...toasts, t];
  all.slice(0, -MAX).forEach((old) => forget(old.id));
  toasts = all.slice(-MAX);
  emit();
  countDown(t.id, SHOWN_MS);
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getToasts = () => toasts;
