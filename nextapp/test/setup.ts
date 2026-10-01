import { beforeEach, vi } from "vitest";
import { openDatabase, useDatabase } from "@/lib/db";
import { resetServerState } from "./state";

// DATA_DIR and the API settings come from vitest.config.mts.

beforeEach(() => {
  // Migrations and syncs log as they go; tests don't need to see that.
  vi.spyOn(console, "log").mockImplementation(() => {});

  // Tests mock the HTTP they expect (see test/http.ts); any other request
  // fails loudly instead of reaching the internet.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      throw new Error("Unexpected fetch in a test: " + url);
    })
  );

  // A fresh, empty database and no leftover rate limits, caches or queues.
  useDatabase(openDatabase(":memory:"));
  resetServerState();
});
