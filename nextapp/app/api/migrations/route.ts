import { migrationRows, migrationTargets } from "@/lib/store";
import { triggerDloadSync } from "@/lib/sync-manager";
import type { MigrationsResponse } from "@/lib/api-types";

// GET /api/migrations — Migrations' rows for every target
// (lib/store/migrations.ts), the targets there are, and whether the DLoad
// sync runs and how it last failed (its ⋯ Sync DLoad). Admin only (proxy.ts).
export async function GET() {
  return Response.json({
    rows: migrationRows(),
    targets: migrationTargets().map((t) => t.name),
    dload: {
      running: triggerDloadSync.running(),
      error: triggerDloadSync.lastError(),
    },
  } satisfies MigrationsResponse);
}
