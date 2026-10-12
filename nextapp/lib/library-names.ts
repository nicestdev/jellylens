// Where a finished download goes in the library: movies/ or shows/, then
// the title's folder "Name (Year) [tmdbid-N]" with TMDB's German title as
// TMDB writes it (Jellyfin finds it by the id), a show's files in Season NN.
// Unlike the FileBot presets that named the library so far, the title keeps
// its case ("RoboCop", "The OA", not "Robocop", "The Oa"); only ":" turns
// into " -" and a censored "F***" back into the word.

// Folder and file names stay within 255 bytes (UTF-8): ext4's limit, and
// never more than exFAT's 255 UTF-16 units (the library's disks).
const MAX_NAME_BYTES = 255;

// What can't be in a file name, on Linux or on Windows (over SMB):
// separators, Windows' reserved characters, control characters; runs of
// spaces made one.
const fileSafe = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/[\\/:*?"<>|]|\p{Cc}/gu, "")
    .replace(/ {2,}/g, " ")
    .trim();

// s cut (at a character, not inside one) to fit max bytes in UTF-8.
function fitBytes(s: string, max: number): string {
  let out = s;
  while (Buffer.byteLength(out) > max) out = Array.from(out).slice(0, -1).join("");
  return out.trim();
}

// "Name (Year) [tmdbid-123]", the title's folder under movies/ or shows/;
// a title too long for it cut short, the year and id always whole.
export function libraryFolderName(media: { title: string; year: number | null; tmdbId: number }): string {
  const name = fileSafe(media.title.replaceAll(":", " -").replace(/\bF\*\*\*/g, "Fuck"));
  const tail = `${media.year ? ` (${media.year})` : ""} [tmdbid-${media.tmdbId}]`;
  return fitBytes(name, MAX_NAME_BYTES - Buffer.byteLength(tail)) + tail;
}

// The files of a download that go into the library: videos and
// subtitles, not samples.
const MEDIA = /\.(mkv|mp4|m4v|avi|ts|m2ts|wmv|mov|srt|ass|ssa|sub|idx|sup)$/i;
export const isLibraryFile = (rel: string) => MEDIA.test(rel) && !/(^|[/._ -])sample([/._ -]|$)/i.test(rel);

// A movie's files under the release's name instead when its video's name
// has spaces ("Name - Title (2014).mkv", as VECTOR names them): the video
// and what starts like it ("….de.srt") get the release name with their
// ending. Only with one video, so no two get the same name; names as they
// were otherwise, or if the release name has spaces too.
const VIDEO = /\.(mkv|mp4|m4v|avi|ts|m2ts|wmv|mov)$/i;
export const isVideo = (name: string) => VIDEO.test(name);
export function releaseFileNames(names: string[], release: string): string[] {
  const videos = names.filter(isVideo);
  if (videos.length !== 1 || !/\s/.test(videos[0]) || !release || /\s/.test(release)) return names;
  const base = videos[0].replace(VIDEO, "");
  return names.map((n) => (n.startsWith(base) ? release + n.slice(base.length) : n));
}

// The season a show's file belongs to: its own SxxEyy, else the package's
// Sxx; null if neither says.
export function seasonOf(rel: string, packageName: string): number | null {
  const own = /S(\d{1,2})E\d{1,3}/i.exec(rel.split("/").pop() ?? rel) ?? /S(\d{1,2})E\d{1,3}/i.exec(rel);
  if (own) return Number(own[1]);
  const pkg = /(?:^|[. _-])S(\d{1,2})(?=[. _-]|$)/i.exec(packageName);
  return pkg ? Number(pkg[1]) : null;
}

export const seasonFolder = (season: number) => `Season ${String(season).padStart(2, "0")}`;
