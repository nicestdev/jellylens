// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import type { DownloadPackageItem, DownloadsResponse } from "@/lib/api-types";
import { QueueActions } from "./queue-controls";

const pkg = (id: number, status: DownloadPackageItem["status"]) =>
  ({ id, status, files: [], outputs: [], sources: [] }) as unknown as DownloadPackageItem;
const data = (packages: DownloadPackageItem[]): DownloadsResponse => ({
  ready: true,
  downloadDir: "/downloads",
  freeBytes: null,
  slots: 2,
  maxSlots: 4,
  packages,
});

describe("QueueActions", () => {
  it("offers Pause all while something runs, Resume all while something's paused", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<QueueActions data={data([pkg(1, "downloading")])} onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Resume all" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Pause all" }));
    expect(onChange).toHaveBeenCalledWith({ paused: true });

    rerender(<QueueActions data={data([pkg(1, "downloading"), pkg(2, "paused")])} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Resume all" }));
    expect(onChange).toHaveBeenLastCalledWith({ paused: false });

    rerender(<QueueActions data={data([pkg(1, "done")])} onChange={onChange} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
