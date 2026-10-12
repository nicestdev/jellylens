// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { ArchivePasswords } from "./archive-passwords";

describe("ArchivePasswords", () => {
  it("adds a password at the end of the list", async () => {
    const save = vi.fn(async () => {});
    render(<ArchivePasswords passwords={["serienfans.org"]} save={save} onError={() => {}} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add password" }));
    const field = screen.getByRole("textbox", { name: "Add password" });
    expect(field).toHaveFocus();
    await userEvent.type(field, " hd-source.to {Enter}");
    expect(save).toHaveBeenCalledWith(["serienfans.org", "hd-source.to"]);
    expect(screen.getByRole("textbox", { name: "Add password" })).toHaveValue("");
  });

  it("closes the field with Esc", async () => {
    render(<ArchivePasswords passwords={["serienfans.org"]} save={vi.fn()} onError={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Add password" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("removes one from its menu", async () => {
    const save = vi.fn(async () => {});
    render(<ArchivePasswords passwords={["serienfans.org", "hd-source.to"]} save={save} onError={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "More options for serienfans.org" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Remove/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sure? Click again" }));
    expect(save).toHaveBeenCalledWith(["hd-source.to"]);
  });

  it("says when there are none, and what went wrong saving", async () => {
    const onError = vi.fn();
    render(<ArchivePasswords passwords={[]} save={() => Promise.reject(new Error("HTTP 500"))} onError={onError} />);
    expect(screen.getByText("None yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add password" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Add password" }), "x{Enter}");
    expect(onError).toHaveBeenLastCalledWith("Couldn't add the password: HTTP 500");
  });
});
