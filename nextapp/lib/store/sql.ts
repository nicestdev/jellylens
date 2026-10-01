import { db, fromJson } from "../db";

// Query helpers for the modules in lib/store/. Reads go straight to SQLite,
// so every request sees what the last sync wrote.
export type DataRow = { data: string };
export const all = <T>(sql: string, ...params: unknown[]) => db().prepare(sql).all(...params) as T[];
export const one = <T>(sql: string, ...params: unknown[]) => db().prepare(sql).get(...params) as T | undefined;
export const run = (sql: string, ...params: unknown[]) => db().prepare(sql).run(...params);
export const byKey = <T>(rows: { key: string; data: string }[]) =>
  Object.fromEntries(rows.map((r) => [r.key, fromJson<T>(r.data)])) as Record<string, T>;
