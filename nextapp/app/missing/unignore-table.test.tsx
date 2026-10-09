// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { UnignoreGrid } from "./unignore-table";

describe("UnignoreGrid", () => {
  it("shows what's ignored as posters with what it belongs to, and takes it back", async () => {
    const onUnignore = vi.fn();
    const onUnignoreAll = vi.fn();
    render(
      <UnignoreGrid
        tiles={[
          { key: "c1-2", title: "Heat 2", meta: "Heat", onUnignore },
          { key: "c2-null", title: "Alien", filterBadge: { label: "All" }, onUnignore: onUnignoreAll },
        ]}
      />,
    );
    expect(screen.getByTitle("Heat 2")).toBeInTheDocument();
    expect(screen.getByText("Heat")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unignore Heat 2" }));
    expect(onUnignore).toHaveBeenCalledOnce();
    expect(onUnignoreAll).not.toHaveBeenCalled();
  });
});
