import { LOCAL_USER, type SessionUser } from "../session";
import { tx } from "../db";
import { all, one, run } from "./sql";

// Something the user wants added to the library, picked from TMDB search on
// Discover and kept on the Wishlist. Title/year/poster are copied in so the list renders
// without calling TMDB again. Whether it has arrived isn't stored: it's
// derived on read by matching tmdbId against the Jellyfin library.
// One entry per title, however many people asked for it: requesters lists
// them, and the entry goes once the last one takes their request back.
export type RequestEntry = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  year: number | null;
  // First release / air date.
  releaseDate: string | null;
  posterPath: string | null;
  // When anyone first asked for it.
  requestedAt: string;
  requesters: Requester[];
};

// A Jellyfin user, by id; the name is kept for the admin's overview.
type Requester = { id: string; name: string; requestedAt: string };

// Requests come back in the order they were first made.
type RequestRow = {
  media_type: RequestEntry["mediaType"];
  tmdb_id: number;
  title: string;
  year: number | null;
  release_date: string | null;
  poster_path: string | null;
  requested_at: string;
};
type RequesterRow = { media_type: string; tmdb_id: number; user_id: string; name: string; requested_at: string };

export function listRequests(): RequestEntry[] {
  const requesters = new Map<string, Requester[]>();
  for (const q of all<RequesterRow>("SELECT * FROM requesters ORDER BY rowid")) {
    const key = q.media_type + ":" + q.tmdb_id;
    requesters.set(key, [...(requesters.get(key) ?? []), { id: q.user_id, name: q.name, requestedAt: q.requested_at }]);
  }
  return all<RequestRow>("SELECT * FROM requests ORDER BY rowid").map((r) => ({
    mediaType: r.media_type,
    tmdbId: r.tmdb_id,
    title: r.title,
    year: r.year,
    releaseDate: r.release_date,
    posterPath: r.poster_path,
    requestedAt: r.requested_at,
    requesters: requesters.get(r.media_type + ":" + r.tmdb_id) ?? [],
  }));
}

export function requestExists(mediaType: string, tmdbId: number): boolean {
  return Boolean(one("SELECT 1 FROM requests WHERE media_type = ? AND tmdb_id = ?", mediaType, tmdbId));
}

export function createRequest(entry: Omit<RequestEntry, "requesters">, requesters: Requester[]) {
  tx(() => {
    run(
      "INSERT OR IGNORE INTO requests (media_type, tmdb_id, title, year, release_date, poster_path, requested_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      entry.mediaType,
      entry.tmdbId,
      entry.title,
      entry.year,
      entry.releaseDate,
      entry.posterPath,
      entry.requestedAt,
    );
    for (const q of requesters) addRequester(entry.mediaType, entry.tmdbId, q);
  });
}

// Adds someone to an existing request; asking twice changes nothing.
export function addRequester(mediaType: string, tmdbId: number, q: Requester) {
  run(
    "INSERT OR IGNORE INTO requesters (media_type, tmdb_id, user_id, name, requested_at) VALUES (?, ?, ?, ?, ?)",
    mediaType,
    tmdbId,
    q.id,
    q.name,
    q.requestedAt,
  );
}

// Removes the request for everyone who asked.
export function removeRequest(mediaType: string, tmdbId: number) {
  run("DELETE FROM requests WHERE media_type = ? AND tmdb_id = ?", mediaType, tmdbId);
}

// Takes one user's request back; the entry goes with its last requester.
export function removeRequester(mediaType: string, tmdbId: number, userId: string) {
  tx(() => {
    run("DELETE FROM requesters WHERE media_type = ? AND tmdb_id = ? AND user_id = ?", mediaType, tmdbId, userId);
    run(
      "DELETE FROM requests WHERE media_type = ? AND tmdb_id = ? AND NOT EXISTS (SELECT 1 FROM requesters WHERE media_type = ? AND tmdb_id = ?)",
      mediaType,
      tmdbId,
      mediaType,
      tmdbId,
    );
  });
}

// Requests made while sign-in was off belong to the local user; this hands
// them to the given user. Where that user asked for the same title too,
// their own request stays and the local one goes.
export function adoptLocalRequests(user: SessionUser) {
  tx(() => {
    run(
      `DELETE FROM requesters WHERE user_id = ? AND EXISTS (
         SELECT 1 FROM requesters q
          WHERE q.media_type = requesters.media_type AND q.tmdb_id = requesters.tmdb_id AND q.user_id = ?)`,
      LOCAL_USER.id,
      user.id,
    );
    run("UPDATE requesters SET user_id = ?, name = ? WHERE user_id = ?", user.id, user.name, LOCAL_USER.id);
  });
}
