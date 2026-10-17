import type { LogsResponse } from "@/lib/api-types";
import { listLogs } from "@/lib/store";

const PAGE = 200;

// GET /api/logs?level=error,warn&area=xrel&q=…&before=<id>&after=<id> — the
// log, newest first: a page before an id (the next one down), or what came
// after one (polling). Admin only (proxy.ts).
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const list = (key: string) => params.get(key)?.split(",").filter(Boolean) ?? [];
  const id = (key: string) => {
    const n = Number(params.get(key));
    return params.has(key) && Number.isInteger(n) ? n : undefined;
  };
  const entries = listLogs({
    levels: list("level"),
    areas: list("area"),
    q: params.get("q") ?? "",
    before: id("before"),
    after: id("after"),
    limit: PAGE,
  });
  return Response.json({ entries, more: entries.length === PAGE } satisfies LogsResponse);
}
