import { stageTriggers, type SyncStage } from "@/lib/sync-manager";
import { start } from "@/lib/scheduler";

// POST /api/sync/<jellyfin|tmdb|missing|releases> — starts that stage and
// answers right away (202); a long sync would outlast a reverse proxy's
// timeout. /api/status says when it's done and how it failed. A stage
// already running isn't started twice. Admin only (see proxy.ts).
export async function POST(_req: Request, { params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  const trigger = stageTriggers[stage as SyncStage];
  if (!Object.hasOwn(stageTriggers, stage)) return Response.json({ error: "No such sync stage." }, { status: 404 });
  start(trigger);
  return Response.json({ running: true }, { status: 202 });
}
