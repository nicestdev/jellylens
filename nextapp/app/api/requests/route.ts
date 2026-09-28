import { store, save, type RequestEntry } from "@/lib/store";
import { AUTH_ENABLED, TMDB_API_KEY } from "@/lib/env";
import { currentUser } from "@/lib/auth";
import { LOCAL_USER, type SessionUser } from "@/lib/session";
import { ensureMetadataLanguage } from "@/lib/sync-manager";
import { libraryIndex, libraryRef, withAvailability } from "@/lib/requests";

// Each user sees their own requests. Admins get everyone's instead (all:
// true), each with who asked, so they see what's wanted most; mine marks
// their own. With sign-in off there's one shared list, as before.
async function listResponse(user: SessionUser) {
  const overview = AUTH_ENABLED && user.admin;
  const index = libraryIndex(store);
  const items = store.requests.flatMap((r) => {
    const own = AUTH_ENABLED ? r.requesters.find((q) => q.id === user.id) : r.requesters[0];
    if (!own && !overview) return [];
    const { requesters, ...rest } = r;
    return [
      {
        ...rest,
        requestedAt: own?.requestedAt ?? r.requestedAt,
        mine: Boolean(own),
        library: libraryRef(index.get(r.mediaType + ":" + r.tmdbId)),
        ...(overview ? { requesters: requesters.map((q) => ({ name: q.name, requestedAt: q.requestedAt })) } : {}),
      },
    ];
  });
  const withAvail = TMDB_API_KEY
    ? await withAvailability(items, TMDB_API_KEY, await ensureMetadataLanguage())
    : items.map((r) => ({ ...r, availability: null }));
  return Response.json({ Items: withAvail, all: overview });
}

// Requests made while sign-in was off (or before it existed) belong to the
// local user; the first admin who shows up takes them over.
function adoptLocalRequests(user: SessionUser) {
  if (!AUTH_ENABLED || !user.admin) return;
  let changed = false;
  for (const r of store.requests) {
    const local = r.requesters.find((q) => q.id === LOCAL_USER.id);
    if (!local) continue;
    r.requesters = r.requesters.filter((q) => q.id !== LOCAL_USER.id);
    if (!r.requesters.some((q) => q.id === user.id)) r.requesters.push({ ...local, id: user.id, name: user.name });
    changed = true;
  }
  if (changed) save();
}

async function signedIn() {
  const user = await currentUser();
  if (user) adoptLocalRequests(user);
  return user;
}

const notSignedIn = () => Response.json({ error: "Not signed in." }, { status: 401 });

export async function GET() {
  const user = await signedIn();
  return user ? listResponse(user) : notSignedIn();
}

type Body = { mediaType: RequestEntry["mediaType"]; tmdbId: number; [field: string]: unknown };

async function readBody(req: Request): Promise<Body | null> {
  try {
    const body = await req.json();
    const { mediaType, tmdbId } = body;
    if (mediaType !== "movie" && mediaType !== "tv") return null;
    if (!Number.isInteger(tmdbId)) return null;
    return body;
  } catch {
    return null;
  }
}

const same = (a: { mediaType: unknown; tmdbId: unknown }, b: { mediaType: unknown; tmdbId: unknown }) =>
  a.mediaType === b.mediaType && a.tmdbId === b.tmdbId;

// Adds the user to the title's requesters, creating the entry if they're
// the first to ask.
export async function POST(req: Request) {
  const user = await signedIn();
  if (!user) return notSignedIn();
  const body = await readBody(req);
  if (!body || typeof body.title !== "string" || !body.title) {
    return Response.json({ error: "Expected { mediaType, tmdbId, title, year, posterPath }." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const me = { id: user.id, name: user.name, requestedAt: now };
  const entry = store.requests.find((r) => same(r, body));
  if (!entry) {
    store.requests.push({
      mediaType: body.mediaType,
      tmdbId: body.tmdbId,
      title: body.title,
      year: Number.isInteger(body.year) ? (body.year as number) : null,
      releaseDate: typeof body.releaseDate === "string" ? body.releaseDate : null,
      posterPath: typeof body.posterPath === "string" ? body.posterPath : null,
      requestedAt: now,
      requesters: [me],
    });
    save();
  } else if (AUTH_ENABLED && !entry.requesters.some((q) => q.id === user.id)) {
    entry.requesters.push(me);
    save();
  }
  return listResponse(user);
}

// Takes the user's own request back; the entry goes with its last
// requester. { everyone: true } from an admin removes it for everybody.
export async function DELETE(req: Request) {
  const user = await signedIn();
  if (!user) return notSignedIn();
  const body = await readBody(req);
  if (!body) return Response.json({ error: "Expected { mediaType, tmdbId }." }, { status: 400 });
  const everyone = !AUTH_ENABLED || (body.everyone === true && user.admin);
  store.requests = store.requests.flatMap((r) => {
    if (!same(r, body)) return [r];
    if (everyone) return [];
    const requesters = r.requesters.filter((q) => q.id !== user.id);
    return requesters.length ? [{ ...r, requesters }] : [];
  });
  save();
  return listResponse(user);
}
