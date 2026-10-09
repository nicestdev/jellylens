// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { Segmented } from "./segmented";

describe("Segmented", () => {
  it("marks the picked segment and picks another", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Layout"
        segments={[
          { key: "list", label: "List" },
          { key: "grid", label: "Grid" },
        ]}
        value="list"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("group", { name: "Layout" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(onChange).toHaveBeenCalledWith("grid");
  });
});
