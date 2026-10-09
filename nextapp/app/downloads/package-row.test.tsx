// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import type { DownloadFileItem, DownloadPackageItem } from "@/lib/api-types";
import { PackageRow } from "./package-row";

const file = (id: number, over: Partial<DownloadFileItem> = {}): DownloadFileItem => ({
  id,
  name: `Heat.1995.part${id}.rar`,
  url: `https://ddownload.com/${id}`,
  size: 512 * 1024 ** 2,
  received: 0,
  status: "queued",
  error: null,
  speed: null,
  inLibrary: false,
  ...over,
});

const pkg: DownloadPackageItem = {
  id: 1,
  name: "Heat.1995.German.DL.1080p.BluRay.x264-WAYNE",
  dir: "Heat.1995.German.DL.1080p.BluRay.x264-WAYNE",
  status: "pending",
  error: null,
  createdAt: "2026-10-07T12:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  media: null,
  matched: true,
  library: null,
  sources: ["ddownload"],
  outputs: [],
  extractPercent: null,
  files: [],
};

const renderRow = (p: DownloadPackageItem, onRemove = vi.fn(), onAction = vi.fn()) =>
  render(
    <table>
      <tbody>
        <PackageRow pkg={p} onAction={onAction} onRemove={onRemove} />
      </tbody>
    </table>,
  );

const more = () => screen.getByRole("button", { name: `More for ${pkg.name}` });
// The state is there twice: in its column, and under the title for phones.
const status = (name: string) => screen.getAllByRole("button", { name })[0];

describe("PackageRow", () => {
  it("shows the title over the release name, its state and size", () => {
    renderRow({ ...pkg, files: [file(1), file(2)] });
    expect(screen.getByText("Heat")).toBeInTheDocument();
    expect(screen.getByText("1995")).toBeInTheDocument();
    expect(screen.getByText("Heat.1995.German.DL.1080p.BluRay.x264-WAYNE")).toBeInTheDocument();
    expect(screen.getAllByText("Ready")).toHaveLength(2);
    expect(screen.getAllByText("1,00 GB")).toHaveLength(2);
    // No parts to open.
    expect(screen.queryByText("Heat.1995.part1.rar")).toBeNull();
  });

  it("while downloading, puts the share done and the speed under the bar", () => {
    renderRow({
      ...pkg,
      status: "downloading",
      files: [file(1, { status: "downloading", received: 256 * 1024 ** 2, speed: 12 * 1024 ** 2 }), file(2)],
    });
    expect(screen.getAllByText("25%")).toHaveLength(2);
    expect(screen.getAllByText(/^12,00 MB\/s · \d+ min$/)).toHaveLength(2);
  });

  it("starts, pauses, resumes or retries on a click on its state, showing that action on hover", async () => {
    const cases: [DownloadPackageItem["status"], string, string][] = [
      ["pending", "Ready", "Start"],
      ["queued", "Waiting", "Pause"],
      ["downloading", "Loading", "Pause"],
      ["paused", "Paused", "Resume"],
      ["failed", "Failed", "Retry"],
    ];
    const actions = { Start: "start", Pause: "pause", Resume: "resume", Retry: "retry" };
    for (const [state, label, action] of cases) {
      const onAction = vi.fn();
      const { unmount } = renderRow({ ...pkg, status: state, files: [file(1)] }, vi.fn(), onAction);
      const button = status(action);
      expect(button).toHaveTextContent(label);
      expect(button).toHaveTextContent(action);
      expect(button).toHaveAttribute("title", action);
      await userEvent.click(button);
      expect(onAction).toHaveBeenCalledWith(actions[action as keyof typeof actions]);
      unmount();
    }
  });

  it("has nothing to click while extracting or done", () => {
    renderRow({ ...pkg, status: "extracting", extractPercent: 40, files: [file(1, { status: "done" })] });
    expect(screen.queryByRole("button", { name: /Start|Pause|Resume|Retry/ })).toBeNull();
  });

  it("asks whether to start only the missing episodes when the library has some", async () => {
    const onAction = vi.fn();
    renderRow(
      {
        ...pkg,
        library: { have: [], parts: 3, partsOwned: 1, season: null },
        files: [file(1, { inLibrary: true }), file(2), file(3)],
      },
      vi.fn(),
      onAction,
    );
    await userEvent.click(status("Start"));
    expect(onAction).not.toHaveBeenCalled();
    expect(await screen.findByRole("menuitem", { name: "Start all 3" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Start only the 2 missing" }));
    expect(onAction).toHaveBeenCalledWith("start", { only: "missing" });
  });

  it("shows a failed package's error, the whole of it on hover", () => {
    const error = "Heat.1995.part1.rar: File not found\nHeat.1995.part2.rar: Timeout";
    renderRow({ ...pkg, status: "failed", error, files: [file(1, { status: "failed" }), file(2)] });
    const lines = screen.getAllByText("File not found +1");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toHaveAttribute("title", error);
  });

  it("warns of a new package's offline or missing parts", () => {
    renderRow({ ...pkg, files: [file(1, { status: "failed", error: "File not found" }), file(3)] });
    const lines = screen.getAllByText("1 part offline · part2 missing");
    expect(lines[1]).toHaveAttribute("title", "Heat.1995.part1.rar: File not found\npart2 missing");
  });

  it("removes a new package from its menu on a second click, the first one only arming it", async () => {
    const onRemove = vi.fn();
    renderRow(pkg, onRemove);
    await userEvent.click(more());
    await screen.findByRole("menuitem", { name: "Remove" });
    // Nothing to reset yet.
    expect(screen.queryByRole("menuitem", { name: "Reset" })).toBeNull();
    await userEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(onRemove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sure? Click again" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("resets or deletes an unfinished one, each on a second click", async () => {
    const onRemove = vi.fn();
    const onAction = vi.fn();
    renderRow({ ...pkg, status: "paused", files: [file(1)] }, onRemove, onAction);
    await userEvent.click(more());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reset" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sure? Click again" }));
    expect(onAction).toHaveBeenCalledWith("reset");
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("offers a finished package's files to download, one item each, and Delete", async () => {
    const onRemove = vi.fn();
    renderRow(
      {
        ...pkg,
        status: "done",
        outputs: [
          { path: "Heat.1995.mkv", size: 8 * 1024 ** 3 },
          { path: "Extras/Making of.mkv", size: 1024 ** 3 },
        ],
      },
      onRemove,
    );
    expect(screen.getAllByText("9,00 GB")).toHaveLength(2);
    await userEvent.click(more());
    const first = await screen.findByRole("menuitem", { name: "Download 1" });
    expect(first).toHaveAttribute("href", "/api/downloads/1/file?path=Heat.1995.mkv");
    expect(screen.getByRole("menuitem", { name: "Download 2" })).toHaveAttribute(
      "href",
      "/api/downloads/1/file?path=Extras%2FMaking%20of.mkv",
    );
    expect(screen.queryByRole("menuitem", { name: "Reset" })).toBeNull();
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sure? Click again" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("calls a single file just Download", async () => {
    renderRow({ ...pkg, status: "done", outputs: [{ path: "Heat.1995.mkv", size: 1 }] });
    await userEvent.click(more());
    expect(await screen.findByRole("menuitem", { name: "Download" })).toBeInTheDocument();
  });

  it("disarms after a few seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onRemove = vi.fn();
      renderRow(pkg, onRemove);
      await user.click(more());
      await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
      expect(screen.getByRole("menuitem", { name: "Sure? Click again" })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(3000));
      expect(screen.getByRole("menuitem", { name: "Remove" })).toBeInTheDocument();
      await user.click(screen.getByRole("menuitem", { name: "Remove" }));
      expect(onRemove).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
