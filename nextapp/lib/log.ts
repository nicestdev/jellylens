import os from "os";
import { version } from "../package.json";
import { addLog, lastStartedVersion, type LogLevel } from "./store";
import type { LogArea } from "./log-areas";

// An Error by its message, a plain object as "key=value …" (a sync's
// result), anything else as JSON.
function format(data: unknown): string {
  if (data instanceof Error) return data.message;
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && !Array.isArray(data))
    return Object.entries(data)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
  return JSON.stringify(data);
}

// The app's log: every line goes to the console (docker logs) and into the
// database, kept 14 days, for the Logs page. area: where it's from
// ("downloads", "xrel"); data: details after the message (format).
function write(level: LogLevel, area: LogArea, message: string, data?: unknown) {
  // "Releases sync failed: xREL rate limit reached", details plain after it.
  const line = data === undefined ? message : `${message}${data instanceof Error ? ":" : ""} ${format(data)}`;
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(`[${area}] ${line}`);
  try {
    addLog(level, area, line);
  } catch (e) {
    // The database busy or not open yet: the console has it.
    console.error("[log] couldn't store a line:", (e as Error).message);
  }
}

export const log = {
  info: (area: LogArea, message: string, data?: unknown) => write("info", area, message, data),
  warn: (area: LogArea, message: string, data?: unknown) => write("warn", area, message, data),
  error: (area: LogArea, message: string, data?: unknown) => write("error", area, message, data),
};

// At boot: the version, and what changed since the last start (an update,
// a new container), so a log read later shows when the app was swapped.
export function logStart() {
  const before = lastStartedVersion();
  const change = !before ? "first start" : before !== version ? `updated from ${before}` : null;
  log.info(
    "app",
    `Started Jellylens ${version}${change ? ` (${change})` : ""}`,
    `· Node ${process.versions.node} · TZ ${process.env.TZ ?? "UTC"} · host ${os.hostname()}`,
  );
}

// How long since start (Date.now()), for a "done" line: "4.2 s", "3 min 12 s".
export function took(start: number): string {
  const s = (Date.now() - start) / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}
