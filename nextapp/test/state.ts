// Server state that lives on globalThis (rate limits, caches, queues; see
// the modules keeping it), dropped so each test starts clean.
const GLOBALS = [
  "__xrelLimit",
  "__xrelSearchQueue",
  "__loginFailures",
  "__jellyfinAccounts",
  "__movieReleases",
  "__releaseSync",
  "__jellylensSyncState",
];

export function resetServerState() {
  for (const key of GLOBALS) delete (globalThis as Record<string, unknown>)[key];
}
