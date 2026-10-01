import type { NextRequest } from "next/server";
import type { FilesResponse } from "@/lib/api-types";
import { queryFiles, type FileSort } from "@/lib/store";
import { fold } from "@/lib/text";

const PAGE_SIZE = 50;

const SORTS: FileSort[] = ["title", "size", "group"];

// GET /api/analytics/files?library=movies|shows&q=&group=&resolution=&codec=&language=&sort=title|size|group&dir=&offset=
// One page of the movies' or the episodes' files for the Analytics page;
// admin only (see proxy.ts), since it lists file names (never paths).
// Words match a title, an episode's number or a file name; filter params can repeat (any of them matches), and an
// empty one stands for files without a group, an unknown resolution or
// codec, or no audio language tagged. Searched, filtered, sorted and paged in SQL.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const sort = SORTS.find((s) => s === params.get("sort")) ?? "title";
  const asc = params.get("dir") ? params.get("dir") === "asc" : sort !== "size";
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const library = params.get("library") === "shows" ? "shows" : "movies";
  const { matched, items } = queryFiles(
    library,
    {
      words: fold(params.get("q") ?? "").split(" ").filter(Boolean),
      groups: params.getAll("group").map((g) => g || null),
      resolutions: params.getAll("resolution"),
      codecs: params.getAll("codec"),
      languages: params.getAll("language"),
    },
    sort,
    asc,
    offset,
    PAGE_SIZE
  );
  return Response.json({ matched, pageSize: PAGE_SIZE, Items: items } satisfies FilesResponse);
}
