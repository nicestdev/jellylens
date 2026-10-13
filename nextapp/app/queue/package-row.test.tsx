// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { wholeText } from "@/test/dom";
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
  checked: "online",
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
  movedTo: null,
  movedAt: null,
  movedFiles: null,
  replaced: false,
  choice: null,
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

// The ⋯ is there twice, on a phone in the title's line and from sm up in a
// column of its own (CSS shows one); the column's comes last.
const more = () => screen.getAllByRole("button", { name: `More for ${pkg.name}` }).at(-1)!;

describe("PackageRow", () => {
  it("shows the title over the release name, how many parts are online and its size", () => {
    renderRow({ ...pkg, files: [file(1), file(2)] });
    expect(screen.getByText("Heat")).toBeInTheDocument();
    expect(screen.queryByText("1995")).toBeNull();
    expect(screen.getByText("Heat.1995.German.DL.1080p.BluRay.x264-WAYNE")).toBeInTheDocument();
    // In its column and under the title for phones.
    expect(screen.getAllByText(wholeText("Online · 2/2"))).toHaveLength(2);
    expect(screen.getAllByText("1.00 GB")).toHaveLength(2);
    // No parts to open.
    expect(screen.queryByText("Heat.1995.part1.rar")).toBeNull();
  });

  it("while downloading, puts its state, speed and the share done under the bar", () => {
    renderRow({
      ...pkg,
      status: "downloading",
      files: [file(1, { status: "downloading", received: 256 * 1024 ** 2, speed: 12 * 1024 ** 2 }), file(2)],
    });
    expect(document.body.textContent).toContain("25\u202f%");
    expect(screen.getAllByText(wholeText(/^Loading · 12.00 MB\/s · \d+ min$/))).toHaveLength(2);
  });

  it("shows its state as plain text, what to do about it first in its menu", async () => {
    const cases: [DownloadPackageItem["status"], RegExp, string][] = [
      ["pending", /^Online · 1\/1$/, "Start"],
      ["queued", /^Waiting$/, "Pause"],
      ["downloading", /^Loading · /, "Pause"],
      ["paused", /^Paused$/, "Resume"],
      ["failed", /^Failed$/, "Retry"],
    ];
    const actions = { Start: "start", Pause: "pause", Resume: "resume", Retry: "retry" };
    for (const [state, label, action] of cases) {
      const onAction = vi.fn();
      const { unmount } = renderRow({ ...pkg, status: state, files: [file(1)] }, vi.fn(), onAction);
      // In its column and under the title for phones (a failed one without
      // an error says Failed); nothing to click.
      expect(screen.getAllByText(wholeText(label)).length).toBeGreaterThanOrEqual(2);
      // Only the ⋯, once for phones and once in its column.
      expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
        `More for ${pkg.name}`,
        `More for ${pkg.name}`,
      ]);
      await userEvent.click(more());
      const items = await screen.findAllByRole("menuitem");
      expect(items[0]).toHaveTextContent(action);
      await userEvent.click(items[0]);
      expect(onAction).toHaveBeenCalledWith(actions[action as keyof typeof actions]);
      unmount();
    }
  });

  it("offers nothing to start or pause while extracting", async () => {
    renderRow({ ...pkg, status: "extracting", extractPercent: 40, files: [file(1, { status: "done" })] });
    await userEvent.click(more());
    await screen.findByRole("menuitem", { name: "Delete" });
    expect(screen.queryByRole("menuitem", { name: /Start|Pause|Resume|Retry/ })).toBeNull();
  });

  it("shows what a Replace takes out and brings, and starts it with Download", async () => {
    const onAction = vi.fn();
    renderRow(
      {
        ...pkg,
        library: {
          old: ["nvme03/movies/Heat (1995) [tmdbid-949]/Heat.1995.720p-OLD.mkv"],
          new: ["Heat.1995.German.DL.1080p.BluRay.x264-WAYNE"],
          exact: false,
          skip: 1,
          choices: ["replace"],
          disks: ["nvme03"],
        },
      },
      vi.fn(),
      onAction,
    );
    expect(screen.getByLabelText("In library")).not.toHaveAttribute("title");
    expect(screen.getByText("Heat.1995.720p-OLD").parentElement).toHaveTextContent(/^−/);
    expect(screen.getAllByText("−1")[0]).toHaveClass("text-destructive");
    expect(screen.getAllByText("+1")[0]).toHaveClass("text-success");
    await userEvent.click(more());
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Download", "Remove"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Download" }));
    expect(onAction).toHaveBeenCalledWith("start", { choice: "replace" });
  });

  it("skips the episodes of this very release the library has, or offers only Remove when it has them all", async () => {
    const onAction = vi.fn();
    const library = {
      old: ["nvme01/shows/Silo (2023) [tmdbid-125988]/Season 01/Silo.S01E01.German.1080p-GRP.mkv"],
      new: ["Season 01/Silo.S01E02.German.1080p-GRP", "Season 01/Silo.S01E03.German.1080p-GRP"],
      exact: true,
      skip: 1,
      choices: ["skip" as const],
      disks: ["nvme01"],
    };
    const { unmount } = renderRow({ ...pkg, library }, vi.fn(), onAction);
    expect(screen.getByText("Silo.S01E02.German.1080p-GRP").parentElement).toHaveTextContent(/^\+/);
    expect(screen.getByText("Silo.S01E01.German.1080p-GRP").parentElement).toHaveTextContent(/^=/);
    expect(screen.getAllByText("=1")[0]).toHaveClass("text-info");
    await userEvent.click(more());
    await userEvent.click(screen.getByRole("menuitem", { name: "Download missing" }));
    expect(onAction).toHaveBeenCalledWith("start", { choice: "skip" });
    unmount();
    renderRow({ ...pkg, library: { ...library, new: [], choices: [] } });
    expect(screen.getAllByText("All in library")[0]).toBeInTheDocument();
    await userEvent.click(more());
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Remove"]);
  });

  it("shows a failed package's error", () => {
    const error = "Heat.1995.part1.rar: File not found\nHeat.1995.part2.rar: Timeout";
    renderRow({ ...pkg, status: "failed", error, files: [file(1, { status: "failed" }), file(2)] });
    const lines = screen.getAllByText("File not found +1");
    expect(lines).toHaveLength(2);
    // Its whole text on hover only when it's cut off.
    fireEvent.mouseEnter(lines[1]);
    expect(lines[1]).not.toHaveAttribute("title");
    Object.defineProperty(lines[1], "scrollWidth", { value: 200 });
    Object.defineProperty(lines[1], "clientWidth", { value: 100 });
    fireEvent.mouseEnter(lines[1]);
    expect(lines[1]).toHaveAttribute("title", "File not found +1");
  });

  it("counts a new package's parts online while the hoster is asked, red when one is missing, why when one failed", () => {
    const { unmount } = renderRow({ ...pkg, files: [file(1), file(2, { checked: null })] });
    expect(screen.getAllByText(wholeText("Checking · 1/2"))).toHaveLength(2);
    unmount();
    // part2 missing: 2 of 3 online.
    const missing = renderRow({ ...pkg, files: [file(1), file(3)] });
    for (const line of screen.getAllByText(wholeText("Online · 2/3"))) expect(line).toHaveClass("text-destructive");
    missing.unmount();
    // part1 offline: why, rather than how many are online.
    renderRow({ ...pkg, files: [file(1, { status: "failed", error: "File not found" }), file(2), file(3)] });
    for (const line of screen.getAllByText(wholeText("File not found · 1 part")))
      expect(line).toHaveClass("text-destructive");
  });

  it("is peach for parts the hoster didn't answer for", () => {
    renderRow({ ...pkg, files: [file(1), file(2, { checked: "unknown" })] });
    for (const line of screen.getAllByText(wholeText("Online · 1/2"))) expect(line).toHaveClass("text-warning");
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
