import { triggerJellyfinSync } from "@/lib/sync-manager";

export async function POST() {
  try {
    const result = await triggerJellyfinSync();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
