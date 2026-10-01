import type { ReleaseDetail } from "@/lib/api-types";
import { matchInfo, setVerdict, tileOf, tileTitleKeys, titleReleases } from "@/lib/store";
import { resolveTitles } from "@/lib/sync-releases";
import { ensureMetadataLanguage } from "@/lib/sync-manager";
import { TMDB_API_KEY } from "@/lib/env";
import { parseReleaseName } from "@/lib/title-match";

type Params = { params: Promise<{ key: string }> };

function detail(key: string): ReleaseDetail {
  return {
    key,
    titles: tileTitleKeys(key).map((titleKey) => {
      const Items = titleReleases(titleKey);
      const { title, year } = parseReleaseName(Items[0]?.name ?? "");
      return { titleKey, label: year ? `${title} (${year})` : title, match: matchInfo(titleKey), Items };
    }),
  };
}

// GET /api/releases/<key> — the xREL titles on one tile, each with its
// releases (newest first) and how its match came about, for the panel the
// tile opens; admin only.
export async function GET(_req: Request, { params }: Params) {
  const { key } = await params;
  return Response.json(detail(key) satisfies ReleaseDetail);
}

// POST { titleKey, verdict: "wrong" | "xrel" | null } — a decision about one
// of the tile's titles from the panel's menu: nothing from TMDB, xREL's link
// after all, or back to the automatic check. Applied right away. Answers
// with the tile, or the title's new one if it was the tile's last.
export async function POST(req: Request, { params }: Params) {
  const { key } = await params;
  const body = await req.json().catch(() => ({}));
  const { titleKey, verdict } = body;
  if (typeof titleKey !== "string" || (verdict !== "wrong" && verdict !== "xrel" && verdict !== null)) {
    return Response.json({ error: 'Expected { titleKey, verdict: "wrong" | "xrel" | null }.' }, { status: 400 });
  }
  if (!tileTitleKeys(key).includes(titleKey)) return Response.json({ error: "No such title." }, { status: 404 });
  setVerdict(titleKey, verdict);
  await resolveTitles(TMDB_API_KEY, await ensureMetadataLanguage(), titleKey);
  const tile = detail(key);
  return Response.json((tile.titles.length ? tile : detail(tileOf(titleKey))) satisfies ReleaseDetail);
}
