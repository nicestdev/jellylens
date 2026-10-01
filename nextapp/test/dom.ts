import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

// For component tests, which start with `// @vitest-environment happy-dom` and
// import this: DOM matchers (toBeInTheDocument, …) and an unmounted page
// after each test. The rest of the suite runs in plain Node without them.
afterEach(cleanup);
