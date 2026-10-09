// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { SlotsMenu } from "./download-slots";

describe("SlotsMenu", () => {
  it("names how many come in at once, and picks another", async () => {
    const onChange = vi.fn();
    render(<SlotsMenu slots={2} maxSlots={4} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "2 files" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /3 files/ }));
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
