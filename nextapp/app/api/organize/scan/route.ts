import type { OrganizeScan } from "@/lib/api-types";
import { rescan, scanState } from "@/lib/rescan";

// GET /api/organize/scan — whether the library scan runs, and how far; POST
// starts it (and has Jellyfin scan too, lib/rescan.ts). Admin only
// (proxy.ts).
export async function GET() {
  return Response.json(scanState() satisfies OrganizeScan);
}

export async function POST() {
  rescan();
  return Response.json(scanState() satisfies OrganizeScan);
}
