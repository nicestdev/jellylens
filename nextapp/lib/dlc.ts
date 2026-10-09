import crypto from "crypto";

// JDownloader's DLC containers. A .dlc is base64: the encrypted package
// list, then an 88-character key that only JDownloader's service turns into
// the AES key (the same exchange pyLoad and other loaders use). The list is
// XML whose names and links are base64 again.
const SERVICE = "http://service.jdownloader.org/dlcrypt/service.php";
const RC_KEY = Buffer.from("cb99b5cbc24db398");
const RC_IV = Buffer.from("9bc24cb995cb8db3");

type DlcFile = { url: string; name: string | null; size: number | null };
type DlcPackage = { name: string; files: DlcFile[] };

function aesDecrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

const b64 = (text: string) => Buffer.from(text.replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
const b64Text = (text: string | undefined) => (text ? b64(text).toString("utf8").trim() : "");

// Asked as pyLoad asks (destType "pylo"): the key comes back encrypted with
// RC_KEY. JDownloader's own destType ("jdtc6") answers with one for its
// own key, which doesn't fit.
async function serviceKey(key: string): Promise<Buffer> {
  const res = await fetch(`${SERVICE}?srcType=dlc&destType=pylo&data=${encodeURIComponent(key)}`);
  const rc = /<rc>([\s\S]*?)<\/rc>/.exec(await res.text())?.[1]?.trim();
  if (!rc) throw new Error(`JDownloader's DLC service answered without a key (HTTP ${res.status})`);
  return aesDecrypt(b64(rc).subarray(0, 16), RC_KEY, RC_IV);
}

export function parseDlcXml(xml: string): DlcPackage[] {
  return [...xml.matchAll(/<package\b([^>]*)>([\s\S]*?)<\/package>/g)].map(([, attrs, body]) => {
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
    const files = [...body.matchAll(/<file>([\s\S]*?)<\/file>/g)].flatMap(([, file]) => {
      const tag = (name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(file)?.[1];
      const url = b64Text(tag("url"));
      if (!url) return [];
      const size = Number(b64Text(tag("size")));
      return [{ url, name: b64Text(tag("filename")) || null, size: size > 0 ? size : null }];
    });
    return { name: b64Text(attr("name")), files };
  });
}

export async function decryptDlc(container: string): Promise<DlcPackage[]> {
  const data = container.replace(/\s+/g, "");
  if (data.length <= 88) throw new Error("Not a DLC container");
  const key = await serviceKey(data.slice(-88));
  const plain = aesDecrypt(b64(data.slice(0, -88)), key, key).toString("latin1");
  const xml = b64(plain).toString("utf8");
  if (!xml.includes("<dlc")) throw new Error("The DLC container didn't decrypt (corrupted, or not a DLC)");
  return parseDlcXml(xml);
}
