import { vi } from "vitest";

// Answers a test's fetch calls: the handler gets each request's URL and
// returns a Response, or undefined for one the test didn't expect (which
// then fails). Returns the mock, to check what was requested.
export function mockFetch(handler: (url: URL, init?: RequestInit) => Response | undefined | Promise<Response | undefined>) {
  const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    // Relative URLs (as the browser-side code fetches) resolve against a test host.
    const url = new URL(String(input), "http://jellylens.test");
    const res = await handler(url, init);
    if (!res) throw new Error("Unexpected fetch in a test: " + url);
    return res;
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

export const json = (body: unknown, init?: ResponseInit & { headers?: Record<string, string> }) =>
  new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
