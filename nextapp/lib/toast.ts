// Short notes that pop up bottom right and go away by themselves
// (components/toaster.tsx shows them): toast("Download started", {
// description: "Heat.1995.German.DL.1080p.BluRay.x264-GROUP", mono: true,
// tone: "success", action: { label: "View", href: "/queue" } }), the title
// over the description, in Mono when it's a release or file name. tone
// colors it: success (green), warning (peach), error (red), or plain. At most three at a time, the oldest dropped first.

type ToastAction = { label: string; href: string };
export type ToastTone = "success" | "warning" | "error" | "plain";
export type Toast = {
  id: number;
  title: string;
  description?: string;
  mono?: boolean;
  tone: ToastTone;
  action?: ToastAction;
};

// Long enough to read; one with a link longer, so it can be reached (by
// keyboard too, where focusing it holds it).
const SHOWN_MS = 2000;
const WITH_LINK_MS = 5000;
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
    mono,
    tone = "plain",
    action,
  }: { description?: string; mono?: boolean; tone?: ToastTone; action?: ToastAction } = {},
) {
  const t = { id: nextId++, title, description, mono, tone, action };
  const all = [...toasts, t];
  all.slice(0, -MAX).forEach((old) => forget(old.id));
  toasts = all.slice(-MAX);
  emit();
  countDown(t.id, action ? WITH_LINK_MS : SHOWN_MS);
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getToasts = () => toasts;
