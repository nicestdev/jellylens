import { dloadCounts, dloadUsers, migrationRows, migrationTargets, syncedAt } from "@/lib/store";
import { triggerDloadSync } from "@/lib/sync-manager";
import type { MigrationsResponse } from "@/lib/api-types";

// GET /api/migrations — Migrations' rows for every target
// (lib/store/migrations.ts), the targets there are, and how the DLoad
// threads' sync stands. Admin only (proxy.ts).
export async function GET() {
  return Response.json({
    rows: migrationRows(),
    targets: migrationTargets().map((t) => t.name),
    dload: {
      ...dloadCounts(),
      groups: dloadUsers().map((u) => u.group),
      syncedAt: syncedAt("dload"),
      running: triggerDloadSync.running(),
      error: triggerDloadSync.lastError(),
    },
  } satisfies MigrationsResponse);
}
