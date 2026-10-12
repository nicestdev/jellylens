// The two libraries Analytics switches between: the movies and the shows
// (their episodes).
export type Library = "movies" | "shows";

const LIBRARIES: { key: Library; label: string }[] = [
  { key: "movies", label: "Movies" },
  { key: "shows", label: "Shows" },
];

// Analytics leads with the shows.
export const LIBRARIES_SHOWS_FIRST = [...LIBRARIES].reverse();
