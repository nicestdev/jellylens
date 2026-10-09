// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/test/dom";
import { DataTable } from "./library-table";

const headers = () => screen.getAllByRole("columnheader");

describe("DataTable", () => {
  it("stretches the first column, or the one marked, and names hidden ones for screen readers only", () => {
    const { rerender } = render(
      <DataTable columns={[{ label: "Title" }, { label: "Year" }, { label: "Remove", hidden: true }]}>
        {null}
      </DataTable>,
    );
    expect(headers()[0]).toHaveClass("w-full");
    expect(screen.getByText("Remove")).toHaveClass("sr-only");
    rerender(<DataTable columns={[{ label: "Source" }, { label: "Contents", stretch: true }]}>{null}</DataTable>);
    expect(headers()[1]).toHaveClass("w-full");
    expect(headers()[0]).not.toHaveClass("w-full");
  });

  it("lays out fixed with set widths, so stacked tables line up", () => {
    render(
      <DataTable columns={[{ label: "Title" }, { label: "Size", align: "right", width: "w-24" }]}>{null}</DataTable>,
    );
    expect(screen.getByRole("table")).toHaveClass("table-fixed");
    expect(headers()[0]).not.toHaveClass("w-full");
    expect(headers()[1]).toHaveClass("w-24", "text-right");
  });

  it("drops phone: false columns below sm, the table then fitting a phone instead of scrolling", () => {
    const { rerender } = render(
      <DataTable columns={[{ label: "Title" }, { label: "Size", phone: false }]}>{null}</DataTable>,
    );
    expect(headers()[1]).toHaveClass("max-sm:hidden");
    expect(headers()[0]).not.toHaveClass("max-sm:hidden");
    expect(screen.getByRole("table")).toHaveClass("sm:min-w-[640px]");
    expect(screen.getByRole("table")).not.toHaveClass("min-w-[640px]");

    rerender(
      <DataTable columns={[{ label: "Title" }, { label: "Size", width: "w-24", phone: false }]}>{null}</DataTable>,
    );
    expect(screen.getByRole("table")).toHaveClass("table-fixed", "sm:min-w-[48rem]");
    expect(screen.getByRole("table")).not.toHaveClass("min-w-[48rem]");

    rerender(<DataTable columns={[{ label: "Title" }, { label: "Size" }]}>{null}</DataTable>);
    expect(screen.getByRole("table")).toHaveClass("min-w-[640px]");
    expect(headers()[1]).not.toHaveClass("max-sm:hidden");
  });
});
