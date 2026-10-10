import type { RequestsResponse } from "@/lib/api-types";
import {
  addRequester,
  adoptLocalRequests,
  createRequest,
  listRequests,
  removeRequest,
  removeRequester,
  requestExists,
  type RequestEntry,
} from "@/lib/store";
import { AUTH_ENABLED, TMDB_API_KEY } from "@/lib/env";
import { currentUser } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { TMDB_LANGUAGE } from "@/lib/env";
import { groupsByTile, libraryIndex, libraryRef } from "@/lib/store";
import { withAvailability } from "@/lib/availability";

// Each user sees their own requests. Admins get everyone's instead (all:
// true), each with who asked, so they see what's wanted most; mine marks
// their own. With sign-in off there's one shared list, as before.
async function listResponse(user: SessionUser) {
  const overview = AUTH_ENABLED && user.admin;
  const index = libraryIndex();
  const entries = listRequests();
  const groups = groupsByTile(entries.map((r) => r.mediaType + ":" + r.tmdbId));
  const items = entries.flatMap((r) => {
    const own = AUTH_ENABLED ? r.requesters.find((q) => q.id === user.id) : r.requesters[0];
    if (!own && !overview) return [];
    const { requesters, ...rest } = r;
    const key = r.mediaType + ":" + r.tmdbId;
    return [
      {
        ...rest,
        requestedAt: own?.requestedAt ?? r.requestedAt,
        mine: Boolean(own),
        library: libraryRef(index.get(key)),
        releaseGroups: groups.get(key) ?? [],
        ...(overview ? { requesters: requesters.map((q) => ({ name: q.name, requestedAt: q.requestedAt })) } : {}),
      },
    ];
  });
  const withAvail = TMDB_API_KEY
    ? await withAvailability(items, TMDB_API_KEY, TMDB_LANGUAGE)
    : items.map((r) => ({ ...r, availability: null }));
  return Response.json({ Items: withAvail, all: overview, admin: user.admin } satisfies RequestsResponse);
}

// Requests made while sign-in was off belong to the local user; the first
// admin who shows up takes them over.
async function signedIn() {
  const user = await currentUser();
  if (user && AUTH_ENABLED && user.admin) adoptLocalRequests(user);
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
  if (!requestExists(body.mediaType, body.tmdbId)) {
    createRequest(
      {
        mediaType: body.mediaType,
        tmdbId: body.tmdbId,
        title: body.title,
        year: Number.isInteger(body.year) ? (body.year as number) : null,
        releaseDate: typeof body.releaseDate === "string" ? body.releaseDate : null,
        posterPath: typeof body.posterPath === "string" ? body.posterPath : null,
        requestedAt: now,
      },
      [me],
    );
  } else if (AUTH_ENABLED) {
    addRequester(body.mediaType, body.tmdbId, me);
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
  if (everyone) removeRequest(body.mediaType, body.tmdbId);
  else removeRequester(body.mediaType, body.tmdbId, user.id);
  return listResponse(user);
}
