import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit and integration tests (npm test). They run in Node against an
// in-memory SQLite database and mocked HTTP (see test/setup.ts); nothing
// reaches Jellyfin, TMDB or xREL.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["./test/setup.ts"],
    // Set before any module reads it (lib/env.ts does on import): whatever
    // still writes to DATA_DIR (image caches, the session secret) goes to a
    // throwaway directory, never a real one.
    env: {
      DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "jellylens-test-")),
      JELLYFIN_URL: "http://jellyfin.test",
      JELLYFIN_API_KEY: "jellyfin-key",
      TMDB_API_KEY: "tmdb-key",
      TMDB_LANGUAGE: "de-DE",
      WCX_URL: "https://wcx.test",
      WCX_API_URL: "https://api.wcx.test",
    },
    restoreMocks: true,
    unstubGlobals: true,
  },
});
