// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/test/dom";
import { SectionTitle } from "./section-title";

describe("SectionTitle", () => {
  it("names the section, with its hint and action", () => {
    render(
      <SectionTitle hint="Each runs on its schedule." action={<button type="button">Sync now</button>}>
        Sync
      </SectionTitle>,
    );
    expect(screen.getByRole("heading", { name: /Sync/ })).toHaveTextContent("SyncEach runs on its schedule.");
    expect(screen.getByRole("button", { name: "Sync now" })).toBeInTheDocument();
  });
});
