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
    await userEvent.type(screen.getByLabelText("Add an archive password"), " hd-source.to {Enter}");
    expect(save).toHaveBeenCalledWith(["serienfans.org", "hd-source.to"]);
    expect(screen.getByLabelText("Add an archive password")).toHaveValue("");
  });

  it("removes one from its menu", async () => {
    const save = vi.fn(async () => {});
    render(<ArchivePasswords passwords={["serienfans.org", "hd-source.to"]} save={save} onError={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "More options for serienfans.org" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Remove/ }));
    expect(save).toHaveBeenCalledWith(["hd-source.to"]);
  });

  it("says when there are none, and what went wrong saving", async () => {
    const onError = vi.fn();
    render(<ArchivePasswords passwords={[]} save={() => Promise.reject(new Error("HTTP 500"))} onError={onError} />);
    expect(screen.getByText("None yet")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Add an archive password"), "x{Enter}");
    expect(onError).toHaveBeenLastCalledWith("Couldn't add the password: HTTP 500");
  });
});
