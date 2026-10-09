// Calendar days as TMDB writes them ("2026-09-30"), compared as strings.
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// The day `days` before `now`.
const daysBefore = (now: Date, days: number) => isoDay(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));

// today and a year back, the two cut-offs the release rules use (see
// movieAvailability in lib/availability.ts).
export const releaseWindow = (now = new Date()) => ({ today: isoDay(now), yearAgo: daysBefore(now, 365) });
