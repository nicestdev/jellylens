// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pause, Play, Upload } from "lucide-react";
import "@/test/dom";
import { PageMenu } from "./page-menu";

describe("PageMenu", () => {
  it("offers what acts on the page in the ⋯, a line between groups, empty ones left out", async () => {
    const pause = vi.fn();
    render(
      <PageMenu
        groups={[
          [{ icon: Upload, label: "Upload DLC", onClick: vi.fn() }],
          [],
          [
            { icon: Pause, label: "Pause all", onClick: pause },
            { icon: Play, label: "Resume all", onClick: vi.fn(), disabled: true },
          ],
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("menuitem", { name: "Resume all" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Upload DLC",
      "Pause all",
      "Resume all",
    ]);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
    await userEvent.click(screen.getByRole("menuitem", { name: "Pause all" }));
    expect(pause).toHaveBeenCalledOnce();
  });
});
