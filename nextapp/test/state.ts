// Server state that lives on globalThis (rate limits, caches, queues; see
// the modules keeping it), dropped so each test starts clean.
const GLOBALS = [
  "__xrelLimit",
  "__xrelSearchQueue",
  "__loginFailures",
  "__jellyfinAccounts",
  "__movieReleases",
  "__releaseSync",
  "__titleMatching",
  "__jellylensTriggers",
  "__jellylensDload",
  "__jellylensDownloader",
  "__jellylensMoves",
  "__organizePage",
  "__jellylensEvents",
  "__ddownloadCookies",
  "__ddownloadSignIn",
  "__realDebridDomains",
  "__realDebridDomainsPending",
  "__downloadMatching",
  "__downloadChecking",
  "__downloadChecked",
  "__downloadOnline",
  "__downloadPeeking",
  "__downloadPeeked",
  "__wcxLinkState",
  "__wcxReleases",
  "__hideCx",
  "__tmdbPosterTries",
  "__showAiring",
  "__jellylensPageTools",
];

export function resetServerState() {
  for (const key of GLOBALS) delete (globalThis as Record<string, unknown>)[key];
}
