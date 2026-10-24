import { all, one, run } from "./sql";

// The uploaders on DLoad whose threads are read (Settings), and their
// threads (lib/sync-dload.ts): Migrations' targets
// (lib/store/migrations.ts) and the title page's DLoad rows.

export type DloadThreadRow = {
  id: number;
  userId: number;
  title: string;
  postedAt: string;
  type: "movie" | "tv" | null;
  tmdbId: number | null;
  imdbId: string | null;
  seasons: number[];
};

// group: the release group most of their thread titles end with
// ("… x265 - w00t"), else their name; threads: how many we know.
export type DloadUser = { id: number; name: string; group: string; threads: number };

export function dloadUsers(): DloadUser[] {
  const users = all<{ id: number; name: string }>("SELECT id, name FROM dload_users ORDER BY lower(name)");
  const counts = new Map<number, Map<string, number>>();
  for (const t of all<{ userId: number; title: string }>("SELECT user_id AS userId, title FROM dload_threads")) {
    const group = /\s-\s(\S+)$/.exec(t.title)?.[1] ?? "";
    const of = counts.get(t.userId) ?? new Map<string, number>();
    of.set(group, (of.get(group) ?? 0) + 1);
    counts.set(t.userId, of);
  }
  return users.map((u) => {
    const of = [...(counts.get(u.id) ?? [])];
    const group = of.filter(([g]) => g).sort((a, b) => b[1] - a[1])[0]?.[0] ?? u.name;
    return { ...u, group, threads: of.reduce((sum, [, n]) => sum + n, 0) };
  });
}

export function addDloadUser(id: number, name: string) {
  run("INSERT INTO dload_users (id, name) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name", id, name);
}

// Their threads go with them.
export function removeDloadUser(id: number) {
  run("DELETE FROM dload_users WHERE id = ?", id);
}

export function addDloadThreads(threads: DloadThreadRow[]) {
  for (const t of threads)
    run(
      `INSERT OR REPLACE INTO dload_threads (id, user_id, title, posted_at, type, tmdb_id, imdb_id, seasons)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id,
      t.userId,
      t.title,
      t.postedAt,
      t.type,
      t.tmdbId,
      t.imdbId,
      JSON.stringify(t.seasons),
    );
}

// A known thread's title as it is now (an upgrade renames it); whether it
// changed.
export function renameDloadThread(id: number, title: string, seasons: number[]): boolean {
  return (
    run(
      "UPDATE dload_threads SET title = ?, seasons = ? WHERE id = ? AND title != ?",
      title,
      JSON.stringify(seasons),
      id,
      title,
    ).changes > 0
  );
}

export function hasDloadThread(id: number): boolean {
  return Boolean(one("SELECT 1 FROM dload_threads WHERE id = ?", id));
}

export function dloadCounts(): { threads: number; matched: number } {
  return one<{ threads: number; matched: number }>(
    "SELECT COUNT(*) AS threads, COUNT(tmdb_id) AS matched FROM dload_threads",
  )!;
}

// The threads of a TMDB title, newest first, with their uploader's id (the
// title page lists them).
export function dloadThreadsOf(
  type: "movie" | "tv",
  tmdbId: number,
): { id: number; userId: number; title: string; postedAt: string }[] {
  return all<{ id: number; userId: number; title: string; postedAt: string }>(
    `SELECT id, user_id AS userId, title, posted_at AS postedAt FROM dload_threads
     WHERE type = ? AND tmdb_id = ? ORDER BY posted_at DESC`,
    type,
    tmdbId,
  );
}
