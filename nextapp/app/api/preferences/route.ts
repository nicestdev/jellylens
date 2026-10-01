import { getPreferences, setPreferences, type Preferences } from "@/lib/store";

// The Settings page's display options; admin only (see proxy.ts).
export async function GET() {
  return Response.json(getPreferences());
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
    if ((key === "showFileNames" || key === "showSdReleases") && typeof value === "boolean") changes[key] = value;
    else return Response.json({ error: "Expected { showFileNames?: boolean, showSdReleases?: boolean }." }, { status: 400 });
  }
  setPreferences(changes);
  return Response.json(getPreferences());
}
