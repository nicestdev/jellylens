import { describe, expect, it, vi } from "vitest";
import { mockFetch } from "@/test/http";
import { fetchThreadImdb, fold, parseSearchPage, parseThreadTitle } from "./dload";

describe("parseThreadTitle", () => {
  it("reads title, year and seasons", () => {
    expect(parseThreadTitle("Tulsa King 2022 S04 GERMAN AAC 1080p WEB x265 - w00t")).toEqual({
      title: "Tulsa King",
      year: 2022,
      seasons: [4],
      release: true,
    });
    expect(parseThreadTitle("Arrow 2012 S01-S03 GERMAN DL 1080p - w00t").seasons).toEqual([1, 2, 3]);
    expect(parseThreadTitle("2001 Odyssee im Weltraum 1968 GERMAN AAC 1080p UHD BluRay HDR x265 - w00t")).toMatchObject(
      {
        title: "2001 Odyssee im Weltraum",
        year: 1968,
        seasons: [],
      },
    );
  });

  it("leaves out a subtitle after the season and edition tags", () => {
    expect(
      parseThreadTitle("Monster S04 Die Geschichte von Lizzie Borden GERMAN AAC 1080p WEB x265 - w00t"),
    ).toMatchObject({ title: "Monster", year: null, seasons: [4] });
    expect(parseThreadTitle("Blood In Blood Out DIRECTORS CUT 1993 GERMAN AAC 1080p - w00t")).toMatchObject({
      title: "Blood In Blood Out",
      year: 1993,
    });
    expect(
      parseThreadTitle("Zwei wie Pech und Schwefel 1974 REMASTERED GERMAN AAC 1080p BluRay x265 - w00t").title,
    ).toBe("Zwei wie Pech und Schwefel");
  });

  it("knows what isn't a release", () => {
    expect(parseThreadTitle("Epubor Ultimate 3.0.16.754").release).toBe(false);
  });
});

it("folds spellings alike", () => {
  expect(fold("Zwei ausser Rand und Band")).toBe(fold("Zwei außer Rand und Band"));
  expect(fold("Toedliche Versprechen Eastern Promises")).toBe(fold("Tödliche Versprechen - Eastern Promises"));
  expect(fold("Minions und Monster")).toBe(fold("Minions & Monster"));
});

it("reads the search's threads and posts", () => {
  const html = `<ol><li class="block-row block-row--separated" data-author="uploader">
    <h3 class="contentRow-title"><a href="/threads/tulsa-king-2022-s04.1366913/">Tulsa King 2022 S04 GERMAN &amp; more - w00t</a></h3>
    <time data-time="1792401816"></time></li>
    <li class="block-row"><a href="/members/x.1/">no thread</a></li>
    <li class="block-row"><h3 class="contentRow-title"><a href="/threads/heat-1995.42/post-7">Heat 1995 GERMAN - w00t</a></h3>
    <time data-time="1792401000"></time></li></ol>`;
  expect(parseSearchPage(html)).toEqual([
    { id: 1366913, title: "Tulsa King 2022 S04 GERMAN & more - w00t", postedAt: new Date(1792401816000).toISOString() },
    { id: 42, title: "Heat 1995 GERMAN - w00t", postedAt: new Date(1792401000000).toISOString() },
  ]);
});

// DLoad as a signed-in member sees it: the sign-in form's token and
// cookie, the form's answer with the session (or none for a wrong
// password), and a page signed in or, while signedOut, not.
function forum({ wrongPassword = false, page = "", signedOut = 0 } = {}) {
  let outFor = signedOut;
  return mockFetch((url, init) => {
    if (url.pathname === "/login/")
      return new Response('<input type="hidden" name="_xfToken" value="tok,123" />', {
        headers: { "Set-Cookie": "xf_csrf=c1; path=/" },
      });
    if (url.pathname === "/login/login")
      return new Response(null, {
        status: 303,
        headers: wrongPassword ? {} : { "Set-Cookie": "xf_user=7%2Cabc; path=/; httponly" },
      });
    if (url.pathname.startsWith("/threads/")) {
      const cookie = new Headers(init?.headers).get("Cookie") ?? "";
      const inside = cookie.includes("xf_user=") && outFor-- <= 0;
      return new Response(`<html data-logged-in="${inside}">${page}</html>`);
    }
  });
}

// The pause between the sign-in form and sending it, skipped.
async function withoutWaits<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    const result = fn();
    result.catch(() => {});
    await vi.advanceTimersByTimeAsync(20_000);
    return await result;
  } finally {
    vi.useRealTimers();
  }
}

const post = (body: string) =>
  `<article class="message message--post js-post"><header></header><article class="message-body js-selectToQuote">${body}</article></article>`;

it("takes the IMDb id from the first post, past its inner articles", async () => {
  forum({
    page:
      post('Rambo (2008) / Film / <a href="https://www.imdb.com/title/tt0462499/">IMDb: 7,0</a>') +
      post('<a href="https://www.imdb.com/de/title/tt0000001/">other</a>'),
  });
  expect(await withoutWaits(() => fetchThreadImdb(848156, "https://dload.test/"))).toBe("tt0462499");
});

describe("signing in", () => {
  it("signs in once with the form's token, then sends the session along", async () => {
    const fetch = forum();
    await withoutWaits(() => fetchThreadImdb(1, "https://dload.test/"));
    await fetchThreadImdb(2, "https://dload.test/");
    const paths = fetch.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toEqual(["/login/", "/login/login", "/threads/1/", "/threads/2/"]);
    const [, form] = fetch.mock.calls[1];
    expect(Object.fromEntries(new URLSearchParams(String(form!.body)))).toMatchObject({
      _xfToken: "tok,123",
      login: "anna",
      password: "dload-secret",
      remember: "1",
    });
    expect(new Headers(form!.headers).get("Cookie")).toBe("xf_csrf=c1");
    expect(new Headers(fetch.mock.calls[3][1]!.headers).get("Cookie")).toContain("xf_user=7%2Cabc");
  });

  it("signs in again once when a page comes back signed out", async () => {
    const fetch = forum({ signedOut: 1 });
    await withoutWaits(() => fetchThreadImdb(1, "https://dload.test/"));
    const paths = fetch.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toEqual(["/login/", "/login/login", "/threads/1/", "/login/", "/login/login", "/threads/1/"]);
  });

  it("says so when the forum doesn't take the password", async () => {
    forum({ wrongPassword: true });
    await expect(withoutWaits(() => fetchThreadImdb(1, "https://dload.test/"))).rejects.toThrow(
      "DLoad didn't sign in anna (HTTP 303)",
    );
  });
});
