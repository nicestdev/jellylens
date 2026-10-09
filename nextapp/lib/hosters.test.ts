import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import { linkInfo, nameFromUrl, resolveLink, routeOf } from "./hosters";

// Which accounts are set up, per test.
const accounts = vi.hoisted(() => ({ ddownload: true, realDebrid: true }));
vi.mock("./env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./env")>()),
  get DDOWNLOAD_LOGIN() {
    return accounts.ddownload ? "anna" : "";
  },
  get DDOWNLOAD_PASSWORD() {
    return accounts.ddownload ? "secret" : "";
  },
  get REALDEBRID_TOKEN() {
    return accounts.realDebrid ? "rd-token" : "";
  },
}));

beforeEach(() => {
  accounts.ddownload = true;
  accounts.realDebrid = true;
});

const RD = "https://api.real-debrid.com/rest/1.0";
const DD = "https://ddownload.com/aaaaaaaaaaaa";

// Real-Debrid covering example.com, and answers for the rest.
function realDebrid(rest: (url: URL, init?: RequestInit) => Response | undefined = () => undefined) {
  return mockFetch((url, init) => (url.href === `${RD}/hosts/domains` ? json(["Example.com"]) : rest(url, init)));
}

describe("nameFromUrl", () => {
  it("is the link's last path part, decoded", () => {
    expect(nameFromUrl("https://example.com/files/Heat.1995.part1.rar")).toBe("Heat.1995.part1.rar");
    expect(nameFromUrl("https://example.com/f/abc/M%C3%BCnchner%20Film.mkv/")).toBe("Münchner Film.mkv");
    expect(nameFromUrl("https://example.com/a.mkv?token=1#x")).toBe("a.mkv");
  });

  it("is the whole link when its path is empty", () => {
    expect(nameFromUrl("https://example.com/")).toBe("https://example.com/");
  });
});

describe("routeOf", () => {
  it("takes ddownload links to its own account", async () => {
    const fetch = realDebrid();
    expect((await routeOf(DD))?.label).toBe("ddownload");
    expect((await routeOf("https://www.ddl.to/f/aaaaaaaaaaaa/Heat.mkv"))?.label).toBe("ddownload");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("takes ddownload links to Real-Debrid when its account isn't set up", async () => {
    accounts.ddownload = false;
    mockFetch((url) => (url.href === `${RD}/hosts/domains` ? json(["ddownload.com"]) : undefined));
    expect((await routeOf(DD))?.label).toBe("ddownload.com via Real-Debrid");
  });

  it("takes other hosters to Real-Debrid if it covers them, subdomains too", async () => {
    realDebrid();
    expect((await routeOf("https://example.com/file/1"))?.label).toBe("example.com via Real-Debrid");
    expect((await routeOf("https://www.example.com/file/1"))?.label).toBe("example.com via Real-Debrid");
    expect((await routeOf("https://dl.eu.example.com/file/1"))?.label).toBe("example.com via Real-Debrid");
    expect(await routeOf("https://example.org/file/1")).toBeNull();
    expect(await routeOf("https://notexample.com/file/1")).toBeNull();
  });

  it("asks Real-Debrid for its hosters once a day", async () => {
    const fetch = realDebrid();
    await routeOf("https://example.com/1");
    await routeOf("https://example.org/2");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("is null without a Real-Debrid token, and asks nobody", async () => {
    accounts.realDebrid = false;
    const fetch = mockFetch(() => undefined);
    expect(await routeOf("https://example.com/file/1")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says when Real-Debrid's hoster list fails", async () => {
    mockFetch(() => new Response("", { status: 502 }));
    await expect(routeOf("https://example.com/file/1")).rejects.toThrow("Real-Debrid's hoster list answered HTTP 502");
  });
});

describe("resolveLink", () => {
  it("unrestricts a link through Real-Debrid with the token", async () => {
    const fetch = realDebrid((url) =>
      url.href === `${RD}/unrestrict/link` ? json({ download: "https://cdn.example.net/x" }) : undefined,
    );
    expect(await resolveLink("https://example.com/file/1")).toEqual({ url: "https://cdn.example.net/x" });
    const [, init] = fetch.mock.calls[1];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer rd-token" });
    expect(String(init?.body)).toBe("link=https%3A%2F%2Fexample.com%2Ffile%2F1");
  });

  it.each([
    [json({ error: "bad_token", error_code: 8 }, { status: 401 }), "Real-Debrid: REALDEBRID_TOKEN is wrong or expired"],
    [json({ error: "bad_token", error_code: 8 }), "Real-Debrid: REALDEBRID_TOKEN is wrong or expired"],
    [new Response("Unauthorized", { status: 401 }), "Real-Debrid: REALDEBRID_TOKEN is wrong or expired"],
    [json({ error: "hoster_unavailable", error_code: 19 }, { status: 503 }), "Real-Debrid: hoster_unavailable"],
    [new Response("oops", { status: 500 }), "Real-Debrid: HTTP 500"],
  ])("explains Real-Debrid's errors (%#)", async (answer, error) => {
    realDebrid((url) => (url.href === `${RD}/unrestrict/link` ? answer : undefined));
    await expect(resolveLink("https://example.com/file/1")).rejects.toThrow(error);
  });

  it("says when nothing covers a link", async () => {
    realDebrid();
    await expect(resolveLink("https://example.org/file/1")).rejects.toThrow(
      "No account for example.org, and Real-Debrid doesn't cover it (or isn't set up)",
    );
  });

  // ddownload's website: the sign-in form, then the file's page.
  function ddownload(page: () => Response) {
    return mockFetch((url, init) => {
      if (url.pathname === "/login") return new Response('<form name="FL"><input name="op" value="login"></form>');
      if (url.pathname === "/" && init?.method === "POST")
        return new Response(null, { status: 302, headers: { location: "/", "set-cookie": "xfss=s1; path=/" } });
      if (url.pathname === "/aaaaaaaaaaaa") return page();
    });
  }

  it("signs in to ddownload and follows the file page's redirect", async () => {
    const fetch = ddownload(
      () => new Response(null, { status: 302, headers: { location: "https://cdn.example.net/Heat.mkv" } }),
    );
    expect(await resolveLink(DD)).toEqual({ url: "https://cdn.example.net/Heat.mkv" });
    const signIn = fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(String(signIn?.[1]?.body)).toBe("op=login&login=anna&password=secret");
    const [, page] = fetch.mock.calls.at(-1)!;
    expect(page?.headers).toMatchObject({ Cookie: "xfss=s1", "User-Agent": "JDownloader" });
  });

  it("says when ddownload has the file no more", async () => {
    ddownload(() => new Response("<h2>File Not Found</h2>"));
    await expect(resolveLink(DD)).rejects.toThrow("ddownload: the file is gone");
  });

  it("says when ddownload's sign-in fails", async () => {
    mockFetch((url, init) => {
      if (url.pathname === "/login") return new Response("");
      if (init?.method === "POST") return new Response('<div id="alertMsg">Incorrect Login or Password</div>');
    });
    await expect(resolveLink(DD)).rejects.toThrow("ddownload sign-in failed: Incorrect Login or Password");
  });
});

describe("linkInfo", () => {
  const ddPage = (html: string) => mockFetch((url) => (url.href === DD ? new Response(html) : undefined));

  it("reads a ddownload file's name and size from its page", async () => {
    ddPage('<div class="dk-dl-name" title="Heat.part1.rar">Heat</div><span class="dk-dl-size"> 1.5 GB </span>');
    expect(await linkInfo(DD)).toEqual({ online: true, name: "Heat.part1.rar", size: Math.round(1.5 * 1024 ** 3) });
  });

  it.each([
    ["700 MB", 700 * 1024 ** 2],
    ["1,25 GB", 1.25 * 1024 ** 3],
    ["512 KB", 512 * 1024],
    ["12 B", 12],
    ["2 tb", 2 * 1024 ** 4],
  ])("reads the size %s", async (text, size) => {
    ddPage(`<span class="dk-dl-size">${text}</span>`);
    expect(await linkInfo(DD)).toEqual({ online: true, name: null, size });
  });

  it("knows a file ddownload has no more, and has no answer for a page without either", async () => {
    ddPage("<h1>File Not Found</h1>");
    expect(await linkInfo(DD)).toEqual({ online: false });
    ddPage("<p>The file was removed by the owner</p>");
    expect(await linkInfo(DD)).toEqual({ online: false });
    ddPage("<html>maintenance</html>");
    expect(await linkInfo(DD)).toBeNull();
  });

  it("asks Real-Debrid about other hosters' links", async () => {
    realDebrid((url) =>
      url.href === `${RD}/unrestrict/check` ? json({ filename: "Heat.mkv", filesize: 1234 }) : undefined,
    );
    expect(await linkInfo("https://example.com/file/1")).toEqual({ online: true, name: "Heat.mkv", size: 1234 });
  });

  it.each([
    [json({ error_code: 24 }), { online: false }],
    [new Response("", { status: 503 }), { online: false }],
    [json({ filename: "Heat.mkv", filesize: 0 }), { online: true, name: "Heat.mkv", size: null }],
    [json({}), null],
  ])("reads Real-Debrid's check (%#)", async (answer, info) => {
    realDebrid((url) => (url.href === `${RD}/unrestrict/check` ? answer : undefined));
    expect(await linkInfo("https://example.com/file/1")).toEqual(info);
  });

  it("is null for a link nothing covers", async () => {
    realDebrid();
    expect(await linkInfo("https://example.org/file/1")).toBeNull();
  });
});
