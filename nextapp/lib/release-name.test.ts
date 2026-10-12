import { describe, expect, it } from "vitest";
import { audioOf, codecOf, episodesOf } from "./release-name";

describe("release names", () => {
  it("reads DL and ML, but not WEB-DL", () => {
    expect(audioOf("Heat.1995.German.DL.1080p.BluRay.x264-VECTOR")).toBe("DL");
    expect(audioOf("Spy.x.Family.S01E25.German.ML.1080p.WEB.H264-ZeroTwo")).toBe("ML");
    expect(audioOf("Heat.1995.German.1080p.WEB-DL.x264-GRP")).toBeNull();
  });

  it("reads the codec as Analytics labels it", () => {
    expect(codecOf("Heat.1995.German.DL.1080p.WEB.H265-ZeroTwo")).toBe("x265");
    expect(codecOf("Heat.1995.German.DL.1080p.BluRay.HEVC-GRP")).toBe("x265");
    expect(codecOf("Heat.1995.German.DL.1080p.WEB.h264-GRP")).toBe("x264");
    expect(codecOf("Heat.1995.German.DL.2160p.WEB.AV1-GRP")).toBe("AV1");
    expect(codecOf("Heat.1995.German.DL.1080p.AMZN.WEB-ZeroTwo")).toBe("");
  });

  it("reads a show release's season and episodes", () => {
    expect(episodesOf("Silo.2023.S01E02.German.DL.1080p.WEB.H264-ZeroTwo")).toEqual({ season: 1, episodes: [2] });
    expect(episodesOf("Silo.2023.S01E01E02.German.DL.1080p.WEB.H264-ZeroTwo")).toEqual({ season: 1, episodes: [1, 2] });
    expect(episodesOf("Silo.2023.S01E01-E03.German.DL.1080p.WEB.H264-ZeroTwo")).toEqual({
      season: 1,
      episodes: [1, 2, 3],
    });
    expect(episodesOf("Silo.2023.S02.German.DL.1080p.WEB.H264-ZeroTwo")).toEqual({ season: 2, episodes: null });
    expect(episodesOf("Silo.S01-S02.German.DL.1080p.WEB.H264-ZeroTwo")).toBeNull();
  });
});
