// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import "@/test/dom";
import { mockIntersection } from "@/test/intersection";
import { LoadMore } from "./load-more";

describe("LoadMore", () => {
  it("asks for more when the end of the list scrolls into view", () => {
    const view = mockIntersection();
    const onMore = vi.fn();
    render(<LoadMore shown={50} onMore={onMore} />);
    expect(onMore).not.toHaveBeenCalled();
    act(() => view.scrollToEnd());
    expect(onMore).toHaveBeenCalledOnce();
  });

  it("waits while a page loads, and checks again after", () => {
    const view = mockIntersection();
    const onMore = vi.fn();
    const { rerender } = render(<LoadMore shown={50} onMore={onMore} loading />);
    act(() => view.scrollToEnd());
    expect(onMore).not.toHaveBeenCalled();
    rerender(<LoadMore shown={100} onMore={onMore} />);
    act(() => view.scrollToEnd());
    expect(onMore).toHaveBeenCalledOnce();
  });
});
