// The two libraries the pages switch between (Missing, Analytics,
// Upgrades): the movies and the shows (their episodes).
export type Library = "movies" | "shows";

export const LIBRARIES: { key: Library; label: string }[] = [
  { key: "movies", label: "Movies" },
  { key: "shows", label: "TV Shows" },
];
