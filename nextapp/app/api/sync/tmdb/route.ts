import { store } from "@/lib/store";
import { triggerTmdbSync } from "@/lib/sync-manager";

export async function POST() {
  try {
    const result = await triggerTmdbSync();
    return Response.json({
      ok: true,
      ...result,
      incompleteCount: Object.keys(store.missing.bySeriesId).length,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
