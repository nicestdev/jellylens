import { store, save, type Preferences } from "@/lib/store";

// The Settings page's display options; admin only (see proxy.ts).
export async function GET() {
  return Response.json(store.preferences);
}

// Merges the given options in; unknown keys and wrong types are rejected.
export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const changes: Partial<Preferences> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "showFileNames" && typeof value === "boolean") changes.showFileNames = value;
    else return Response.json({ error: "Expected { showFileNames: boolean }." }, { status: 400 });
  }
  Object.assign(store.preferences, changes);
  save();
  return Response.json(store.preferences);
}
