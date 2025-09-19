import { PageLink } from "@suwatte/daisuke";

// A stripped-down version of the NetworkClient for helper methods
export interface SimpleNetworkClient {
  get(url: string, config?: any): Promise<{ data: any }>;
}

export async function fetchText(
  url: string,
  client?: SimpleNetworkClient
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
  // Fallback for non-JSCore environments (e.g. local testing)
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

export async function fetchManifest(
  url: string,
  client?: SimpleNetworkClient
): Promise<any> {
  if (client) {
    const { data } = await client.get(url, {
      headers: { Accept: "application/json" },
    });
    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch {
        throw new Error("Invalid Cubari manifest JSON");
      }
    }
    return data;
  }
  // Fallback for non-JSCore environments
  const g: any = globalThis as any;
  if (typeof g.fetch === "function") {
    const res = await g.fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok)
      throw new Error(`Failed to fetch Cubari manifest: ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Invalid Cubari manifest JSON");
    }
  }
  // Final fallback: XMLHttpRequest
  const XHR = g.XMLHttpRequest;
  if (typeof XHR === "function") {
    const text: string = await new Promise((resolve, reject) => {
      try {
        const req = new XHR();
        req.open("GET", url, true);
        req.setRequestHeader("Accept", "application/json");
        req.onreadystatechange = function () {
          if (req.readyState === 4) {
            if (req.status >= 200 && req.status < 300)
              resolve(req.responseText);
            else
              reject(
                new Error(`Failed to fetch Cubari manifest: ${req.status}`)
              );
          }
        };
        req.onerror = () =>
          reject(new Error("Network error while fetching Cubari manifest"));
        req.send();
      } catch (e) {
        reject(e);
      }
    });
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Invalid Cubari manifest JSON");
    }
  }
  throw new Error("No NetworkClient, fetch, or XMLHttpRequest available");
}

export function pageLinkToString(link: PageLink): string {
  const anyLink = link as any;
  return (anyLink?.url as string | undefined) ?? (link as any)?.id ?? "";
}