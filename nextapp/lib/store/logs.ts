import { all, one, run } from "./sql";

// What happened, for Logs (lib/log.ts). at: ISO time.
export type LogLevel = "info" | "warn" | "error";
export type LogEntry = { id: number; at: string; level: LogLevel; area: string; message: string };

export function addLog(level: LogLevel, area: string, message: string) {
  run(
    "INSERT INTO logs (at, level, area, message) VALUES (?, ?, ?, ?)",
    new Date().toISOString(),
    level,
    area,
    message,
  );
}

// Newest first, limit at a time: those before id `before` (the next page)
// or after id `after` (what came since); every word of q in the message or
// the area, any case.
export function listLogs({
  levels = [],
  areas = [],
  q = "",
  before,
  after,
  limit = 200,
}: {
  levels?: string[];
  areas?: string[];
  q?: string;
  before?: number;
  after?: number;
  limit?: number;
} = {}): LogEntry[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const among = (column: string, values: string[]) => {
    if (!values.length) return;
    where.push(`${column} IN (${values.map(() => "?").join(", ")})`);
    params.push(...values);
  };
  among("level", levels);
  among("area", areas);
  for (const word of q.split(/\s+/).filter(Boolean)) {
    where.push("(message LIKE ? ESCAPE '\\' OR area LIKE ? ESCAPE '\\')");
    const like = `%${word.replace(/[\\%_]/g, "\\$&")}%`;
    params.push(like, like);
  }
  if (before !== undefined) {
    where.push("id < ?");
    params.push(before);
  }
  if (after !== undefined) {
    where.push("id > ?");
    params.push(after);
  }
  return all<LogEntry>(
    `SELECT id, at, level, area, message FROM logs ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY id DESC LIMIT ?`,
    ...params,
    limit,
  );
}

export function pruneLogs(days = 14) {
  return run("DELETE FROM logs WHERE at < ?", new Date(Date.now() - days * 86_400_000).toISOString()).changes;
}

// The version the last start logged (lib/log.ts' logStart), null if none.
export function lastStartedVersion(): string | null {
  const row = one<{ message: string }>(
    "SELECT message FROM logs WHERE area = 'app' AND message LIKE 'Started Jellylens %' ORDER BY id DESC LIMIT 1",
  );
  return row ? (/^Started Jellylens (\S+)/.exec(row.message)?.[1] ?? null) : null;
}
