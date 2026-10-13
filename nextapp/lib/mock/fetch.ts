// Mock data (the sidebar's Dev section, components/dev-tools.tsx): while
// it's on, the GETs of the Queue, the wishlist and Settings are answered in the
// browser from lib/mock/data.ts and lib/mock/settings.ts, and every other request to
// those routes (and Settings' Sync, and ignoring or unignoring a show,
// whose lists stay real) is refused, so no action meant for made-up data
// reaches the real thing. Only in `next dev`; nothing is written anywhere.
import { mockDownloads, mockOrganize, mockRequests } from "./data";
import { mockConfig, mockPreferences, mockReleaseGroups, mockStatus } from "./settings";

const KEY = "mock";
const ROUTES: Record<string, () => unknown> = {
  "/api/downloads": mockDownloads,
  "/api/organize": mockOrganize,
  "/api/requests": mockRequests,
  "/api/status": mockStatus,
  "/api/config": mockConfig,
  "/api/preferences": mockPreferences,
  "/api/release-groups": mockReleaseGroups,
};
const MOCKED = [...Object.keys(ROUTES), "/api/sync", "/api/ignored"];

export function mockOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

// Turned on or off: the page loads again, with or without it.
export function setMock(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
  location.reload();
}

export function installMockFetch() {
  if ("mocked" in window.fetch) return;
  const real = window.fetch.bind(window);
  const mocked: typeof fetch = (input, init) => {
    if (!mockOn()) return real(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, location.origin).pathname;
    const get = !init?.method || init.method === "GET";
    if (get && ROUTES[path]) return Promise.resolve(Response.json(ROUTES[path]()));
    if (!get && MOCKED.some((route) => path.startsWith(route))) {
      return Promise.resolve(Response.json({ error: "Mock data: actions are off" }, { status: 409 }));
    }
    return real(input, init);
  };
  window.fetch = Object.assign(mocked, { mocked: true });
}
