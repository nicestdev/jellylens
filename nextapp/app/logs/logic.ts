import type { LogEntry, LogLevel } from "@/lib/api-types";
import { formatDate } from "@/lib/format";

export const LEVELS: LogLevel[] = ["error", "warn", "info"];
export const levelLabel = (l: string) => ({ error: "Error", warn: "Warning", info: "Info" })[l] ?? l;

const two = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

const clock = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;

// "06:32:18 17.10.2026", in the browser's time zone.
export const logTime = (iso: string) => {
  const d = new Date(iso);
  return `${clock(d)} ${formatDate(d.getTime() / 1000)}`;
};

// "2026-10-17 06:32:18 +02:00": the browser's time and its offset, so a
// copied line can be held against the server's (UTC) logs.
export function logStamp(iso: string): string {
  const d = new Date(iso);
  const off = -d.getTimezoneOffset();
  const zone = `${off < 0 ? "-" : "+"}${two(Math.floor(Math.abs(off) / 60))}:${two(Math.abs(off) % 60)}`;
  return `${dayOf(d)} ${clock(d)} ${zone}`;
}

// The lines by day, newest first, each day headed "Today", "Yesterday" or
// "Thursday, 15.10.2026".
export function logDays(entries: LogEntry[], now = new Date()): { label: string; entries: LogEntry[] }[] {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const days = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const key = dayOf(new Date(e.at));
    days.set(key, [...(days.get(key) ?? []), e]);
  }
  return [...days].map(([key, list]) => ({
    label:
      key === dayOf(now)
        ? "Today"
        : key === dayOf(yesterday)
          ? "Yesterday"
          : `${new Date(list[0].at).toLocaleDateString("en-US", { weekday: "long" })}, ${formatDate(Date.parse(list[0].at) / 1000)}`,
    entries: list,
  }));
}

// The query for /api/logs: the filters, and a page before or after an id.
export function logsQuery(f: { q: string; levels: Set<string>; areas: Set<string> }, page: string = ""): string {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.levels.size) params.set("level", [...f.levels].join(","));
  if (f.areas.size) params.set("area", [...f.areas].join(","));
  const qs = params.toString() + (page ? (params.size ? "&" : "") + page : "");
  return "/api/logs" + (qs ? "?" + qs : "");
}

// What Copy puts on the clipboard: one line each, oldest first, as a log reads.
export const copyText = (entries: LogEntry[]) =>
  [...entries]
    .reverse()
    .map((e) => `${logStamp(e.at)} ${e.level.toUpperCase().padEnd(5)} [${e.area}] ${e.message}`)
    .join("\n");
