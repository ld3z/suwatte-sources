import { PageLink } from "@suwatte/daisuke";
import { load, CheerioAPI } from "cheerio";

export interface SimpleNetworkClient {
  get(url: string, config?: any): Promise<{ data: any }>;
}

export async function fetchText(
  url: string,
  client?: SimpleNetworkClient,
): Promise<string> {
  if (client) {
    const res = await client.get(url, {
      headers: { Accept: "text/html,application/json" },
    });
    if (typeof res.data === "string") return res.data as string;
    try {
      return JSON.stringify(res.data);
    } catch {
      return "";
    }
  }
  const g: any = globalThis as any;
  if (typeof g.fetch === "function") {
    const r = await g.fetch(url);
    return await r.text();
  }
  const XHR = g.XMLHttpRequest;
  if (typeof XHR === "function") {
    return await new Promise<string>((resolve, reject) => {
      try {
        const req = new XHR();
        req.open("GET", url, true);
        req.onreadystatechange = function () {
          if (req.readyState === 4) {
            if (req.status >= 200 && req.status < 300)
              resolve(req.responseText);
            else reject(new Error(`Failed to fetch text: ${req.status}`));
          }
        };
        req.onerror = () => reject(new Error("Network error"));
        req.send();
      } catch (e) {
        reject(e);
      }
    });
  }
  return "";
}

export function pageLinkToString(link: PageLink): string {
  const anyLink = link as any;
  return (anyLink?.url as string | undefined) ?? (link as any)?.id ?? "";
}

export function toAbsoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export function proxifyImage(absoluteUrl: string): string {
  // Pass URLs directly to Suwatte without ANY modifications
  return absoluteUrl || "";
}

export function fetchDoc(html: string): CheerioAPI {
  return load(html);
}
