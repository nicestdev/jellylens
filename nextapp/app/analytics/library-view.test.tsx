// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import type { LibraryAnalytics } from "@/lib/api-types";
import { LibraryView } from "./library-view";

const GB = 1024 ** 3;

const movies: LibraryAnalytics = {
  titles: 4,
  withFiles: 4,
  files: 4,
  size: 4 * GB,
  pending: false,
  groups: [
    { value: "FuN", files: 3, size: GB },
    { value: "GRP", files: 1, size: 3 * GB },
  ],
  resolutions: [{ value: "1080p", files: 4, size: 4 * GB }],
  codecs: [{ value: "x265", files: 4, size: 4 * GB }],
  languages: [
    { value: "DE", files: 4, size: 4 * GB },
    { value: "EN", files: 1, size: GB },
  ],
};

// The file list's requests, answered with none.
const files = () =>
  mockFetch((url) => {
    if (url.pathname !== "/api/analytics/files") return;
    return json({ matched: 0, pageSize: 50, Items: [] });
  });

describe("LibraryView", () => {
  it("shows the tiles, the charts and the file list", async () => {
    files();
    render(<LibraryView library="movies" stats={movies} version="2026-10-01T00:00:00.000Z" />);
    expect(screen.getByText("Average size")).toBeInTheDocument();
    expect(screen.getByText("Files by group")).toBeInTheDocument();
    expect(screen.getByText("Files by audio language")).toBeInTheDocument();
    expect(await screen.findByText("No files")).toBeInTheDocument();
  });

  it("says when there's nothing synced yet", () => {
    render(<LibraryView library="shows" stats={{ ...movies, titles: 0 }} version={null} />);
    expect(screen.getByText("No shows yet")).toBeInTheDocument();
  });
});
