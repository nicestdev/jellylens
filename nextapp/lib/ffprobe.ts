import { execFile } from "child_process";
import { promisify } from "util";
import { normalizeLanguage } from "./languages";

const run = promisify(execFile);

// What the library scan reads from a video file with ffprobe: its length,
// its video stream's codec ("hevc", "h264"; "" if none) and size, and its
// audio languages ("DE", "EN"; lib/languages.ts), untagged ones left out.
export type Probe = {
  seconds: number | null;
  codec: string;
  width?: number;
  height?: number;
  languages: string[];
};

type RawProbe = {
  format?: { duration?: string };
  streams?: {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    disposition?: { attached_pic?: number };
    tags?: { language?: string };
  }[];
};

// A probe from ffprobe's JSON. A cover image (an MKV's attachment, an
// MP4's artwork) is a video stream too, so it's skipped.
export function toProbe(raw: RawProbe): Probe {
  const streams = raw.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const languages = new Set<string>();
  for (const s of streams) {
    if (s.codec_type !== "audio") continue;
    const code = normalizeLanguage(s.tags?.language);
    if (code) languages.add(code);
  }
  const seconds = Number(raw.format?.duration);
  return {
    seconds: Number.isFinite(seconds) ? seconds : null,
    codec: video?.codec_name?.toLowerCase() ?? "",
    width: video?.width,
    height: video?.height,
    languages: [...languages],
  };
}

// Reads only the container's headers, so it's quick even over a network
// mount (about 0.1 s a file over sshfs). Throws if ffprobe fails or isn't
// installed.
export async function ffprobe(file: string): Promise<Probe> {
  const { stdout } = await run(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,width,height:stream_disposition=attached_pic:stream_tags=language",
      "-of",
      "json",
      file,
    ],
    { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
  );
  return toProbe(JSON.parse(stdout) as RawProbe);
}
