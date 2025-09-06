import {
  CatalogRating,
  Chapter,
  ChapterData,
  Content,
  ContentSource,
  DirectoryConfig,
  DirectoryRequest,
  ImageRequestHandler,
  NetworkRequest,
  PagedResult,
  Property,
  RunnerInfo,
  PageLink,
  PageLinkResolver,
  ResolvedPageSection,
  PageSection,
  SectionStyle,
  Highlight,
} from "@suwatte/daisuke";
import { load } from "cheerio";

// Cubari source (scaffold)
// Direct-link resolver for Cubari gist-based JSON links.
// Supported URLs (initially):
// - https://cubari.moe/read/gist/<base64_of_"raw/<owner>/<repo_or_gist>/<branch_or_path>/file.json">/
// Optional chapter/group segments are supported: /<chapter>/<group>/
// NOTE: Cubari short aliases (e.g., /read/gist/OPM/) are not supported in this initial version.

export const info: RunnerInfo = {
  id: "org.cubari",
  name: "Cubari",
  version: 0.1,
  website: "https://cubari.moe",
  supportedLanguages: ["en_US"],
  thumbnail: "cubari_logo.png",
  minSupportedAppVersion: "6.0.0",
  rating: CatalogRating.MIXED,
};

export class Target
  implements ContentSource, ImageRequestHandler, PageLinkResolver
{
  info = info;
  private client = new NetworkClient();

  // --- PageLinkResolver ---
  async resolvePageSection(
    _link: PageLink,
    _sectionID: string,
  ): Promise<ResolvedPageSection> {
    // Not used for this resolver-only source; sections are already fully built in getSectionsForPage
    throw new Error("Method not used.");
  }

  // Extract an array of PageLink objects from a chapter entry
  private extractPagesFromChapter(
    chap: any,
    groupName?: string,
  ): { url: string }[] {
    // If chapter itself is an array, treat as pages
    if (Array.isArray(chap)) {
      return this.normalizePagesArray(chap);
    }
    // Case 1: pages directly on chapter
    if (Array.isArray(chap?.pages)) {
      return this.normalizePagesArray(chap.pages);
    }
    // Common alternative keys at chapter root
    if (Array.isArray(chap?.images))
      return this.normalizePagesArray(chap.images);
    if (Array.isArray(chap?.urls)) return this.normalizePagesArray(chap.urls);
    if (Array.isArray(chap?.links)) return this.normalizePagesArray(chap.links);
    if (Array.isArray(chap?.data)) return this.normalizePagesArray(chap.data);

    // Case 2: groups object
    const groups = chap?.groups ?? chap?.group;
    if (groups) {
      // If groups is an array, treat as a list of page URLs
      if (Array.isArray(groups)) {
        return this.normalizePagesArray(groups);
      }
      if (typeof groups === "object") {
        let selected: any;
        if (groupName && groups[groupName]) selected = groups[groupName];
        if (!selected) {
          const names = Object.keys(groups);
          if (names.length > 0) selected = groups[names[0]];
        }
        if (Array.isArray(selected)) return this.normalizePagesArray(selected);
        // Some manifests may nest pages under a key like 'pages' or 'images'
        if (selected && typeof selected === "object") {
          if (Array.isArray(selected.pages))
            return this.normalizePagesArray(selected.pages);
          if (Array.isArray(selected.images))
            return this.normalizePagesArray(selected.images);
          if (Array.isArray(selected.urls))
            return this.normalizePagesArray(selected.urls);
          if (Array.isArray(selected.links))
            return this.normalizePagesArray(selected.links);
          if (Array.isArray(selected.data))
            return this.normalizePagesArray(selected.data);
          // If object values are strings or page-like objects, collect them
          const values = Object.values(selected);
          const stringValues = values.filter(
            (v) => typeof v === "string",
          ) as string[];
          const objectValues = values.filter(
            (v) => v && typeof v === "object" && !Array.isArray(v),
          );
          if (stringValues.length)
            return this.normalizePagesArray(stringValues);
          const objectUrlItems = objectValues
            .map((o: any) => o?.url ?? o?.u ?? o?.src ?? o?.link)
            .filter((u: any): u is string => typeof u === "string");
          if (objectUrlItems.length)
            return this.normalizePagesArray(objectUrlItems);
          // Or the first array value in the object
          const firstArray = values.find((v: any) => Array.isArray(v)) as
            | any[]
            | undefined;
          if (firstArray) return this.normalizePagesArray(firstArray);
        }
      }
    }

    return [];
  }

  // Normalize different page entry formats into { url: string }[]
  private normalizePagesArray(arr: any[]): { url: string }[] {
    return arr
      .map((v) => {
        if (typeof v === "string") return { url: v };
        if (v && typeof v === "object") {
          const url = v.url ?? v.u ?? v.src ?? v.link;
          if (typeof url === "string") return { url };
        }
        return null;
      })
      .filter((v): v is { url: string } => !!v);
  }

  // Return the value associated with a group selection, used to detect proxy string endpoints
  private selectGroupValue(chap: any, groupName?: string): any {
    const groups = chap?.groups ?? chap?.group;
    if (!groups) return undefined;
    if (Array.isArray(groups)) return groups;
    if (typeof groups === "object") {
      if (groupName && groups[groupName] != null) return groups[groupName];
      const names = Object.keys(groups);
      if (names.length > 0) return groups[names[0]];
    }
    return undefined;
  }

  // Fetch pages from a Cubari proxy link like '/proxy/api/imgchest/chapter/...'
  private async fetchProxyPages(link: string): Promise<{ url: string }[]> {
    const url = link.startsWith("http")
      ? link
      : `https://cubari.moe${link.startsWith("/") ? "" : "/"}${link}`;
    // Try JSON first
    try {
      const data = await this.fetchManifest(url);
      if (Array.isArray(data)) return this.normalizePagesArray(data);
      if (Array.isArray(data?.images))
        return this.normalizePagesArray(data.images);
      if (Array.isArray(data?.pages))
        return this.normalizePagesArray(data.pages);
      if (Array.isArray(data?.data)) return this.normalizePagesArray(data.data);
      if (data && typeof data === "object") {
        const values = Object.values(data);
        const firstArray = values.find((v: any) => Array.isArray(v)) as
          | any[]
          | undefined;
        if (firstArray) return this.normalizePagesArray(firstArray);
      }
    } catch {}
    // Fallback: fetch as HTML and parse <img> tags
    const html = await this.fetchText(url);
    if (html) {
      const $ = load(html);
      const imgs = $("img")
        .toArray()
        .map((el: any) => {
          const src = $(el).attr("data-src") || $(el).attr("src");
          return src ? { url: src } : null;
        })
        .filter((v: { url: string } | null): v is { url: string } => !!v);
      if (imgs.length) return imgs;
    }
    return [];
  }

  // Fetch raw text via NetworkClient/fetch/XMLHttpRequest
  private async fetchText(url: string): Promise<string> {
    if (this.client) {
      const res = await this.client.get(url, {
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
    const XHR = (g as any).XMLHttpRequest;
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

  private instructionsSection(): PageSection {
    return {
      id: "cubari_instructions",
      title: "How to use Cubari Resolver",
      style: SectionStyle.PADDED_LIST,
      items: [
        {
          id: "info",
          title:
            "Paste a Cubari gist link (or base64) in the Browse/Search bar",
          subtitle:
            "Examples: 1) Full: https://cubari.moe/read/gist/<base64>/  2) Base64 only: <base64>",
          cover: "/assets/cubari_logo.png",
        },
      ],
    };
  }

  async getSectionsForPage(link: PageLink): Promise<PageSection[]> {
    const linkStr = this.pageLinkToString(link);
    if (!linkStr) {
      return [this.instructionsSection()];
    }
    let parsed = this.parseCubariUrl(linkStr);
    if (!parsed) {
      // Attempt short-alias resolution if this looks like a cubari gist URL
      try {
        const u = new URL(
          linkStr.startsWith("http") ? linkStr : `https://${linkStr}`,
        );
        const parts = u.pathname.split("/").filter(Boolean);
        if (
          u.hostname.replace(/^www\./, "") === "cubari.moe" &&
          parts[0] === "read" &&
          parts[1] === "gist" &&
          parts[2]
        ) {
          const slug = await this.resolveAliasToBase64(u.origin + u.pathname);
          if (slug) parsed = this.parseCubariUrl(slug);
        }
      } catch {}
      if (!parsed) return [this.instructionsSection()];
    }
    // Do not network-fetch here; just surface a generic resolved tile.
    const contentId = this.buildSeriesId(parsed.base64Key);
    const items: Highlight[] = [
      {
        id: contentId,
        title: "Cubari Series",
        cover: "/assets/cubari_logo.png",
        subtitle: "Tap to open",
      },
    ];
    return [
      {
        id: "cubari_resolved",
        title: "Cubari Link",
        items,
        style: SectionStyle.PADDED_LIST,
      },
    ];
  }

  // Fetch a content/series detail page
  async getContent(contentId: string): Promise<Content> {
    const ctx = this.parseSeriesId(contentId);
    const manifest = await this.fetchManifest(ctx.rawJsonUrl);
    return this.manifestToContent(contentId, manifest);
  }

  // Fetch list of chapters for a series
  async getChapters(contentId: string): Promise<Chapter[]> {
    const ctx = this.parseSeriesId(contentId);
    const manifest = await this.fetchManifest(ctx.rawJsonUrl);
    const entries = Object.entries(manifest.chapters ?? {});
    // Sort by numeric chapter when possible
    entries.sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
    const chapters: Chapter[] = [];
    let runningIndex = 0;
    for (const [chapNo, chap] of entries as [string, any][]) {
      const baseTitle: string | undefined =
        chap.title ?? chap.volume?.toString?.();
      // Use release_date[0] as it's the format in the JSON
      const chapDate = this.parseChapterDate(chap?.release_date?.[0]);
      const hasGroupsObject =
        chap.groups &&
        typeof chap.groups === "object" &&
        !Array.isArray(chap.groups);
      if (hasGroupsObject) {
        const groupEntries = Object.entries(chap.groups);
        // Emit a chapter per group
        for (const [groupId, groupValue] of groupEntries) {
          // Use the group name from manifest.groups if available, otherwise fall back to groupId
          const groupName = manifest.groups?.[groupId] || groupId;
          const chapterId = this.buildChapterId(ctx.base64Key, chapNo, groupId);
          chapters.push({
            chapterId,
            title: baseTitle
              ? `Ch. ${chapNo} - ${baseTitle} [${groupName}]`
              : `Ch. ${chapNo} [${groupName}]`,
            number: parseFloat(chapNo),
            language: manifest.lang ?? "en",
            index: runningIndex++,
            date: chapDate,
          });
        }
      } else {
        // Single chapter, default group '.' when no explicit groups
        const chapterId = this.buildChapterId(ctx.base64Key, chapNo, ".");
        chapters.push({
          chapterId,
          title: baseTitle ? `Ch. ${chapNo} - ${baseTitle}` : `Ch. ${chapNo}`,
          number: parseFloat(chapNo),
          language: manifest.lang ?? "en",
          index: runningIndex++,
          date: chapDate,
        });
      }
    }
    return chapters;
  }

  // Parse the 'last_updated' field from gist manifests into a Date
  private parseChapterDate(input: unknown): Date {
    if (typeof input === "number") {
      const ms = input < 1e12 ? input * 1000 : input; // seconds vs ms
      return new Date(ms);
    }
    if (typeof input === "string") {
      const n = Number(input);
      if (!Number.isNaN(n)) {
        const ms = n < 1e12 ? n * 1000 : n;
        return new Date(ms);
      }
      const d = new Date(input);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  // Fetch images for a chapter
  async getChapterData(
    _contentId: string,
    chapterId: string,
  ): Promise<ChapterData> {
    const { base64Key, chapter, group } = this.parseChapterId(chapterId);
    const { rawJsonUrl } = this.parseSeriesId(this.buildSeriesId(base64Key));
    const manifest = await this.fetchManifest(rawJsonUrl);
    const chap = manifest.chapters?.[chapter];
    if (!chap) throw new Error(`Chapter '${chapter}' not found in manifest`);

    // Resolve pages from either chap.pages, chap.groups[group], or a proxy link string
    let pages = this.extractPagesFromChapter(
      chap,
      group === "." ? undefined : group,
    );
    if (!pages || pages.length === 0) {
      // Check if the selected group value is a string pointing to a proxy endpoint
      const sel = this.selectGroupValue(
        chap,
        group === "." ? undefined : group,
      );
      if (typeof sel === "string") {
        pages = await this.fetchProxyPages(sel);
      }
    }
    if (!pages || pages.length === 0) {
      const availableGroups =
        chap?.groups && !Array.isArray(chap.groups)
          ? Object.keys(chap.groups).join(", ")
          : Array.isArray(chap?.groups)
            ? "(unnamed array)"
            : "none";
      throw new Error(
        `Group/page list not found in chapter. Requested group='${group}'. Available groups: ${availableGroups}`,
      );
    }
    return { pages };
  }

  // Optional: tags/genres (Cubari JSONs often don't expose genres; leave empty)
  async getTags?(): Promise<Property[]> {
    return [];
  }

  // Optional: directory/search. For Cubari, we may only support direct links initially.
  async getDirectory(query: DirectoryRequest<any>): Promise<PagedResult> {
    const q = (query.query ?? "").trim();
    if (!q) {
      // Show instructions as a pseudo-search result
      const item: Highlight = {
        id: "cubari_instructions",
        title: "Paste a Cubari gist URL or base64 in the search bar",
        cover: "/assets/cubari_logo.png",
        subtitle:
          "Full: https://cubari.moe/read/gist/<base64>/  |  Or: just the <base64>",
      };
      return { results: [item], isLastPage: true };
    }

    let parsed = this.parseCubariUrl(q);
    if (!parsed) {
      // Fallback: extract base64 after 'gist/' from the query string
      const m = q.match(/gist\/([A-Za-z0-9_-]+)/);
      if (m && m[1]) {
        const b64 = m[1];
        parsed = this.parseCubariUrl(b64);
      }
      // If still not parsed, try short-alias fetch
      if (!parsed && /cubari\.moe\/.+\/read\/gist\//.test(q)) {
        try {
          const slug = await this.resolveAliasToBase64(q);
          if (slug) parsed = this.parseCubariUrl(slug);
        } catch {}
      }
      if (!parsed) {
        const item: Highlight = {
          id: "cubari_invalid",
          title: "Unsupported Cubari URL",
          cover: "/assets/cubari_logo.png",
          subtitle:
            "Paste either the full Cubari gist link or just the base64 key.",
        };
        return { results: [item], isLastPage: true };
      }
    }
    // Attempt to fetch manifest to show real title/cover; gracefully fall back if networking isn't available
    const contentId = this.buildSeriesId(parsed.base64Key);
    try {
      const manifest = await this.fetchManifest(parsed.rawJsonUrl);
      const title = manifest.title ?? "Cubari Series";
      const cover = manifest.cover ?? "/assets/cubari_logo.png";
      const item: Highlight = {
        id: contentId,
        title,
        cover,
        subtitle: manifest.description ?? undefined,
      };
      return { results: [item], isLastPage: true };
    } catch {
      const item: Highlight = {
        id: contentId,
        title: "Cubari Series",
        cover: "/assets/cubari_logo.png",
        subtitle: "Tap to open",
      };
      return { results: [item], isLastPage: true };
    }
  }

  async getDirectoryConfig(_configID?: string): Promise<DirectoryConfig> {
    return { filters: [] };
  }

  // Image request hook to set Referer when needed
  async willRequestImage(url: string): Promise<NetworkRequest> {
    return { url, headers: { Referer: "https://cubari.moe/" } };
  }

  // --- Helpers ---
  private pageLinkToString(link: PageLink): string {
    // Daisuke's PageLink typically has 'id' for logical pages. Some environments may also provide a 'url'.
    const anyLink = link as any;
    return (anyLink?.url as string | undefined) ?? (link as any)?.id ?? "";
  }

  private parseCubariUrl(url: string): {
    base64Key: string;
    rawJsonUrl: string;
    chapter?: string;
    group?: string;
  } | null {
    // Accept either a full Cubari URL or just the slug
    let slug: string | null = null;
    let chapter: string | undefined;
    let group: string | undefined;

    // Try as URL first (with fallback to adding https://)
    const asUrl = (() => {
      try {
        return new URL(url);
      } catch {
        try {
          return new URL("https://" + url);
        } catch {
          return null;
        }
      }
    })();

    if (asUrl && asUrl.hostname.replace(/^www\./, "") === "cubari.moe") {
      const parts = asUrl.pathname.split("/").filter(Boolean);
      // Expect: ["read","gist","<slug>","<chapter>","<group>"]
      if (parts[0] === "read" && parts[1] === "gist" && parts[2]) {
        slug = parts[2];
        chapter = parts[3];
        group = parts[4];
      } else {
        return null;
      }
    }

    // If not a URL or not matched, treat input as slug
    if (!slug) {
      const candidate = url.trim();
      if (/^[A-Za-z0-9_=-]+$/.test(candidate)) {
        slug = candidate;
      } else {
        return null;
      }
    }

    // Use Cubari's API endpoint for both short aliases and base64 slugs
    const rawJsonUrl = `https://cubari.moe/read/api/gist/series/${slug}/`;

    return { base64Key: slug, rawJsonUrl, chapter, group };
  }

  // Because parseCubariUrl is sync, provide an async resolver to be used by callers when alias is suspected.
  private async resolveAliasToBase64(url: string): Promise<string | null> {
    try {
      const html = await this.fetchText(url);
      if (!html) return null;
      // Look for an embedded /read/gist/<slug>/ occurrence in the HTML
      const m = html.match(/\bread\/gist\/([A-Za-z0-9_=-]+)\b/);
      if (m && m[1]) return m[1];
      return null;
    } catch {
      return null;
    }
  }

  private isBase64Url(s: string): boolean {
    return /^[A-Za-z0-9_=-]+$/.test(s);
  }

  private buildSeriesId(slug: string) {
    return `gist|${slug}`;
  }

  private parseSeriesId(contentId: string): {
    base64Key: string;
    rawJsonUrl: string;
  } {
    if (!contentId.startsWith("gist|")) {
      throw new Error("Unsupported content id; expected gist|<slug>");
    }
    const slug = contentId.substring(5);
    const rawJsonUrl = `https://cubari.moe/read/api/gist/series/${slug}/`;
    return { base64Key: slug, rawJsonUrl };
  }

  private buildChapterId(slug: string, chapter: string, group: string) {
    return `gist|${slug}|${chapter}|${group}`;
  }

  private parseChapterId(chapterId: string): {
    base64Key: string;
    chapter: string;
    group: string;
  } {
    if (!chapterId.startsWith("gist|")) {
      throw new Error(
        "Unsupported chapter id; expected gist|<slug>|<chapter>|<group>",
      );
    }
    const parts = chapterId.split("|");
    if (parts.length < 4) throw new Error("Invalid Cubari chapter id format");
    return { base64Key: parts[1], chapter: parts[2], group: parts[3] };
  }

  private async fetchManifest(url: string): Promise<any> {
    // Prefer Suwatte's global NetworkClient in the JSCore runtime
    if (this.client) {
      const { data } = await this.client.get(url, {
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
    // Fallback for local Node builds/tests
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
    // Final fallback: XMLHttpRequest (JSCore environments may expose this)
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
                  new Error(`Failed to fetch Cubari manifest: ${req.status}`),
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

  private manifestToContent(_contentId: string, manifest: any): Content {
    const title = manifest.title ?? "Cubari Series";
    const cover = manifest.cover ?? ""; // Required by BaseItem; ideally manifest should provide this
    const creators: string[] = [];
    if (manifest.author) creators.push(manifest.author);
    if (manifest.artist) creators.push(manifest.artist);
    return {
      title,
      cover,
      summary: manifest.description ?? undefined,
      creators: creators.length ? creators : undefined,
      properties: [],
    };
  }
}
