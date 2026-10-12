import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { mockFetch } from "@/test/http";
import { decryptDlc, parseDlcXml } from "./dlc";

const b64 = (text: string) => Buffer.from(text).toString("base64");

// A <file> of a DLC's list, its fields base64 as in a real one.
const file = (url: string, name?: string, size?: string) =>
  `<file><url>${b64(url)}</url>${name !== undefined ? `<filename>${b64(name)}</filename>` : ""}${
    size !== undefined ? `<size>${b64(size)}</size>` : ""
  }</file>`;

const dlcXml = (packages: string) => `<dlc><header></header><content>${packages}</content></dlc>`;

describe("parseDlcXml", () => {
  it("reads each package's name and its files' links, names and sizes", () => {
    const xml = dlcXml(
      `<package name="${b64("Heat.1995")}" comment="">` +
        file("https://example.com/a", "Heat.part1.rar", "1000") +
        file("https://example.com/b", "Heat.part2.rar", "2000") +
        `</package><package name="${b64("Other")}">${file("https://example.com/c")}</package>`,
    );
    expect(parseDlcXml(xml)).toEqual([
      {
        name: "Heat.1995",
        files: [
          { url: "https://example.com/a", name: "Heat.part1.rar", size: 1000 },
          { url: "https://example.com/b", name: "Heat.part2.rar", size: 2000 },
        ],
      },
      { name: "Other", files: [{ url: "https://example.com/c", name: null, size: null }] },
    ]);
  });

  it("leaves out files without a link, and sizes that aren't above zero", () => {
    const xml = dlcXml(
      `<package name="${b64("P")}">` +
        `<file><url></url><filename>${b64("lost.rar")}</filename></file>` +
        `<file><filename>${b64("lost.rar")}</filename></file>` +
        file("https://example.com/a", "a.rar", "0") +
        file("https://example.com/b", "b.rar", "-5") +
        file("https://example.com/c", "c.rar", "lots") +
        `</package>`,
    );
    expect(parseDlcXml(xml)[0].files).toEqual([
      { url: "https://example.com/a", name: "a.rar", size: null },
      { url: "https://example.com/b", name: "b.rar", size: null },
      { url: "https://example.com/c", name: "c.rar", size: null },
    ]);
  });

  it("reads base64 broken over lines, and a package without a name", () => {
    const url = b64("https://example.com/a-rather-long-link-to-a-file");
    const xml = dlcXml(`<package><file><url>${url.slice(0, 20)}\n  ${url.slice(20)}</url></file></package>`);
    expect(parseDlcXml(xml)).toEqual([
      { name: "", files: [{ url: "https://example.com/a-rather-long-link-to-a-file", name: null, size: null }] },
    ]);
  });

  it("is empty without packages", () => {
    expect(parseDlcXml(dlcXml(""))).toEqual([]);
    expect(parseDlcXml("not xml at all")).toEqual([]);
  });
});

describe("decryptDlc", () => {
  // The key JDownloader's service wraps its answer in (as in lib/dlc.ts).
  const RC_KEY = Buffer.from("cb99b5cbc24db398");
  const RC_IV = Buffer.from("9bc24cb995cb8db3");
  const encrypt = (data: Buffer, key: Buffer, iv: Buffer) => {
    const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  };
  // Pads to AES blocks with spaces, which base64 decoding skips.
  const pad = (text: string) => text + " ".repeat((16 - (text.length % 16)) % 16);

  // A container for xml, and the service answering with its key.
  function container(xml: string) {
    const key = Buffer.from("0123456789abcdef");
    const body = encrypt(Buffer.from(pad(b64(xml)), "latin1"), key, key).toString("base64");
    const serviceKey = "k".repeat(88);
    const rc = encrypt(key, RC_KEY, RC_IV).toString("base64");
    const fetch = mockFetch((url) =>
      url.hostname === "service.jdownloader.org" && url.searchParams.get("data") === serviceKey
        ? new Response(`<rc>${rc}</rc>`)
        : undefined,
    );
    return { dlc: `${body.slice(0, 10)}\n${body.slice(10)}${serviceKey}\n`, fetch };
  }

  it("decrypts a container with the key from JDownloader's service", async () => {
    const { dlc, fetch } = container(
      dlcXml(`<package name="${b64("Heat")}">${file("https://example.com/a", "a.mkv", "42")}</package>`),
    );
    expect(await decryptDlc(dlc)).toEqual([
      { name: "Heat", files: [{ url: "https://example.com/a", name: "a.mkv", size: 42 }] },
    ]);
    expect(String(fetch.mock.calls[0][0])).toContain("destType=pylo");
  });

  it("rejects what decrypts to something else than a DLC", async () => {
    const { dlc } = container("<html>nope</html>");
    await expect(decryptDlc(dlc)).rejects.toThrow("The DLC container didn't decrypt");
  });

  it("rejects anything no longer than the 88-character key, without asking the service", async () => {
    const fetch = mockFetch(() => undefined);
    await expect(decryptDlc("a".repeat(88))).rejects.toThrow("Not a DLC container");
    await expect(decryptDlc(" a ".repeat(88))).rejects.toThrow("Not a DLC container");
    await expect(decryptDlc("")).rejects.toThrow("Not a DLC container");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says so when the service answers without a key", async () => {
    mockFetch(() => new Response("<rc></rc>", { status: 500 }));
    await expect(decryptDlc("a".repeat(89))).rejects.toThrow(
      "JDownloader's DLC service answered without a key (HTTP 500)",
    );
  });
});
