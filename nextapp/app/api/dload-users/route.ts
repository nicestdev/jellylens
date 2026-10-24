import type { DloadUsersResponse } from "@/lib/api-types";
import { addDloadUser, dloadUsers, removeDloadUser } from "@/lib/store";
import { triggerDloadSync } from "@/lib/sync-manager";
import { DLOAD_URL, DLOAD_USER } from "@/lib/env";
import { log } from "@/lib/log";

// The Settings page's DLoad uploaders; admin only (see proxy.ts).
const list = (): DloadUsersResponse => ({ items: dloadUsers() });

export async function GET() {
  return Response.json(list());
}

// Adds one ({ link }) by their profile's link, ".../members/name.12345/"
// (its name and forum id), and reads their threads in the background.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const m = typeof body.link === "string" ? /(?:^|members\/)([^/\s]+)\.(\d+)\/?$/.exec(body.link.trim()) : null;
  if (!m) {
    return Response.json(
      { error: "Paste their profile's link, the one ending in /members/name.12345/" },
      { status: 400 },
    );
  }
  addDloadUser(Number(m[2]), m[1]);
  log.info("dload", `Added uploader ${m[1]}`, `· user ${m[2]}`);
  if (DLOAD_URL && DLOAD_USER) triggerDloadSync().catch(() => {}); // already logged by makeTrigger
  return Response.json(list());
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "number") return Response.json({ error: "Expected { id }." }, { status: 400 });
  const gone = dloadUsers().find((u) => u.id === body.id);
  removeDloadUser(body.id);
  log.info("dload", `Removed uploader ${gone?.name ?? body.id}`, gone ? `· ${gone.threads} threads` : undefined);
  return Response.json(list());
}
