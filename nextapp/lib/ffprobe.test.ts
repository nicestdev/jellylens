import { describe, expect, it } from "vitest";
import { toProbe } from "./ffprobe";

describe("toProbe", () => {
  it("reads the length, the video stream and the audio languages", () => {
    expect(
      toProbe({
        format: { duration: "5856.416000" },
        streams: [
          { codec_type: "video", codec_name: "HEVC", width: 1920, height: 1040 },
          { codec_type: "audio", tags: { language: "ger" } },
          { codec_type: "audio", tags: { language: "deu" } },
          { codec_type: "audio", tags: { language: "eng" } },
          { codec_type: "subtitle", tags: { language: "fre" } },
        ],
      }),
    ).toEqual({ seconds: 5856.416, codec: "hevc", width: 1920, height: 1040, languages: ["DE", "EN"] });
  });

  it("skips a cover image and untagged audio", () => {
    expect(
      toProbe({
        streams: [
          { codec_type: "video", codec_name: "mjpeg", width: 600, height: 900, disposition: { attached_pic: 1 } },
          { codec_type: "video", codec_name: "h264", width: 1280, height: 720, disposition: { attached_pic: 0 } },
          { codec_type: "audio", tags: { language: "und" } },
          { codec_type: "audio" },
        ],
      }),
    ).toEqual({ seconds: null, codec: "h264", width: 1280, height: 720, languages: [] });
  });

  it("has no codec for a file without a video stream", () => {
    expect(toProbe({})).toEqual({ seconds: null, codec: "", width: undefined, height: undefined, languages: [] });
  });
});
