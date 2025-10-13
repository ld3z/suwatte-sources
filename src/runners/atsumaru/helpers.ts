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
  if (!absoluteUrl) return "";
  let url = String(absoluteUrl).trim();

  // Fix malformed concatenations like "https://atsu.moeposters/..." or "https://atsu.moeposters..."
  url = url.replace(/^https?:\/\/atsu\.moeposters\//i, "https://atsu.moe/static/posters/");
  url = url.replace(/^https?:\/\/atsu\.moeposters/i, "https://atsu.moe/static/posters");

  // Ensure host has trailing slash if concatenated without one
  url = url.replace(/^https?:\/\/atsu\.moe(?!\/)/i, "https://atsu.moe/");

  // Collapse duplicate /static/posters/ occurrences (e.g. /static/static/posters/)
  url = url.replace(/\/static\/+posters\//gi, "/static/posters/");

  // Convert host + /posters/ => host + /static/posters/
  url = url.replace(/(https?:\/\/[^\/]*atsu\.moe)\/posters\//i, "$1/static/posters/");

  // If the URL is a plain "posters/..." or "/posters/..." prefix, make it canonical.
  if (/^\/?posters\//i.test(url)) {
    url = url.replace(/^\/?posters\//i, "https://atsu.moe/static/posters/");
  }

  // If it contains '/posters/' but not '/static/posters/', convert the occurrences safely.
  if (url.toLowerCase().includes("/posters/") && !url.toLowerCase().includes("/static/posters/")) {
    url = url.split("/posters/").join("/static/posters/");
  }

  // If it's site-relative under /static/posters, ensure host is present.
  if (/^\/static\/posters\//i.test(url)) {
    url = "https://atsu.moe" + url;
  }

  // Final collapse: reduce repeated "/static" segments to a single "/static"
  url = url.replace(/(\/static)+/gi, "/static");

  return url;
}

export function fetchDoc(html: string): CheerioAPI {
  return load(html);
}
