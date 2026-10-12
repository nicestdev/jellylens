import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

// For component tests, which start with `// @vitest-environment happy-dom` and
// import this: DOM matchers (toBeInTheDocument, …) and an unmounted page
// after each test. The rest of the suite runs in plain Node without them.
afterEach(cleanup);

// A getByText matcher for text split over elements (a "·" is a Dot of its
// own): the innermost element whose whole text is it.
export const wholeText =
  (text: string | RegExp) =>
  (_: string, el: Element | null): boolean => {
    // Whitespace collapsed, as getByText does (a unit's narrow space too).
    const is = (e: Element) => {
      const t = (e.textContent ?? "").replace(/\s+/g, " ").trim();
      return typeof text === "string" ? t === text : text.test(t);
    };
    return !!el && is(el) && ![...el.children].some(is);
  };
