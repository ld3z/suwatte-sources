import { Chapter, Content, Highlight } from "@suwatte/daisuke";
import { load } from "cheerio";

// Helper function to resolve alias to base64 using fetchText
async function resolveAliasToBase64(
  url: string,
  fetcher: (url: string) => Promise<string>
): Promise<string | null> {
  try {
    const html = await fetcher(url);
    if (!html) return null;
    const m = html.match(/\bread\/gist\/([A-Za-z0-9_=-]+)\b/);
    if (m && m[1]) return m[1];
    return null;
  } catch {
    return null;
  }
}

export function parseCubariUrl(
  url: string
):
  | {
      id: string;
      rawJsonUrl: string;
      type: "gist" | "mangadex";
      chapter?: string;
      group?: string;
    }
  | null {
  console.log(`Parsing URL: ${url}`);
  let slug: string | null = null;
  let chapter: string | undefined;
  let group: string | undefined;
  let type: "gist" | "mangadex" | null = null;

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

  if (asUrl) {
    const host = asUrl.hostname.replace(/^www\./, "");
    const parts = asUrl.pathname.split("/").filter(Boolean);

    if (host === "cubari.moe") {
      if (parts[0] === "read" && parts[1] === "gist" && parts[2]) {
        slug = parts[2];
        chapter = parts[3];
        group = parts[4];
        type = "gist";
      } else if (parts[0] === "read" && parts[1] === "mangadex" && parts[2]) {
        slug = parts[2];
        chapter = parts[3];
        group = parts[4];
        type = "mangadex";
      } else {
        return null;
      }
    } else if (host === "mangadex.org") {
      // Support MangaDex series URLs
      if (parts[0] === "title" && parts[1]) {
        slug = parts[1];
        type = "mangadex";
      }
      // Support MangaDex chapter URLs
      else if (parts[0] === "chapter" && parts[1]) {
        slug = parts[1];
        type = "mangadex";
        chapter = parts[1];
      }
  }
  }

  // Manual fallback parsing when URL API is unavailable or fails
  if (!slug && !type) {
    const s = url.trim();
    const normalized = s.replace(/^[a-z]+:\/\//i, "");
    const [rawHost, ...rest] = normalized.split("/");
    const host2 = (rawHost || "").replace(/^www\./, "");
    const parts2 = rest.filter(Boolean);

    if (host2 === "cubari.moe") {
      if (parts2[0] === "read" && parts2[1] === "gist" && parts2[2]) {
        slug = parts2[2];
        chapter = parts2[3];
        group = parts2[4];
        type = "gist";
      } else if (parts2[0] === "read" && parts2[1] === "mangadex" && parts2[2]) {
        slug = parts2[2];
        chapter = parts2[3];
        group = parts2[4];
        type = "mangadex";
      }
    } else if (host2 === "mangadex.org") {
      // Support MangaDex series URLs
      if (parts2[0] === "title" && parts2[1]) {
        slug = parts2[1];
        type = "mangadex";
      }
      // Support MangaDex chapter URLs
      else if (parts2[0] === "chapter" && parts2[1]) {
        slug = parts2[1];
        type = "mangadex";
        chapter = parts2[1];
      }
    }
  }

  if (!slug || !type) {
    const candidate = url.trim();
    // Check for MangaDex UUID first (more specific)
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        candidate
      )
    ) {
      slug = candidate;
      type = "mangadex";
    }
    // Support base64 gist IDs (but exclude UUIDs)
    else if (/^[A-Za-z0-9_=-]+$/.test(candidate) && !candidate.includes('-')) {
      slug = candidate;
      type = "gist";
    } else {
      return null;
    }
  }

  const rawJsonUrl = `https://cubari.moe/read/api/${type}/series/${slug}/`;
  return { id: slug, rawJsonUrl, type, chapter, group };
}

export async function resolveShortUrl(
  link: string,
  fetcher: (url: string) => Promise<string>
) {
  try {
    const url = new URL(link.startsWith("http") ? link : `https://${link}`);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.hostname.replace(/^www\./, "") === "cubari.moe" &&
      parts[0] === "read" &&
      parts[1] === "gist" &&
      parts[2]
    ) {
      const slug = await resolveAliasToBase64(url.origin + url.pathname, fetcher);
      if (slug) return parseCubariUrl(slug);
    }
  } catch (e) {
    console.error("Error resolving short URL", e);
  }
  return null;
}

export function buildSeriesId(type: "gist" | "mangadex", slug: string) {
  return `${type}|${slug}`;
}

export function parseSeriesId(contentId: string): {
  id: string;
  rawJsonUrl: string;
  type: "gist" | "mangadex";
} {
  const parts = contentId.split("|");
  if (parts.length < 2 || (parts[0] !== "gist" && parts[0] !== "mangadex")) {
    throw new Error("Unsupported content id; expected gist|<slug> or mangadex|<uuid>");
  }
  const type = parts[0] as "gist" | "mangadex";
  const slug = parts[1];
  const rawJsonUrl = `https://cubari.moe/read/api/${type}/series/${slug}/`;
  return { id: slug, rawJsonUrl, type };
}

export function buildChapterId(
  type: "gist" | "mangadex",
  slug: string,
  chapter: string,
  group: string
) {
  return `${type}|${slug}|${chapter}|${group}`;
}

export function parseChapterId(chapterId: string): {
  id: string;
  type: "gist" | "mangadex";
  chapter: string;
  group: string;
} {
  const parts = chapterId.split("|");
  if (parts.length < 4 || (parts[0] !== "gist" && parts[0] !== "mangadex")) {
    throw new Error(
      "Unsupported chapter id; expected (gist|mangadex)|<slug>|<chapter>|<group>"
    );
  }
  const type = parts[0] as "gist" | "mangadex";
  return { id: parts[1], type, chapter: parts[2], group: parts[3] };
}

export function manifestToContent(
  _contentId: string,
  manifest: any
): Content {
  const title = manifest.title ?? "Cubari Series";
  const cover = manifest.cover ?? "";
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

export function manifestToSearchHighlight(
  contentId: string,
  manifest: any
): Highlight {
  const title = manifest.title ?? "Cubari Series";
  const cover = manifest.cover ?? "/assets/cubari_logo.png";
  return {
    id: contentId,
    title,
    cover,
    subtitle: manifest.description ?? undefined,
  };
}

function parseChapterDate(input: unknown): Date {
  if (typeof input === "number") {
    const ms = input < 1e12 ? input * 1000 : input;
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

export function manifestToChapters(
  type: "gist" | "mangadex",
  id: string,
  manifest: any
): Chapter[] {
  const entries = Object.entries(manifest.chapters ?? {});
  entries.sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
  const chapters: Chapter[] = [];
  let runningIndex = 0;
  for (const [chapNo, chap] of entries as [string, any][]) {
    const baseTitle: string | undefined =
      chap.title ?? chap.volume?.toString?.();
    const chapDate = parseChapterDate(chap?.release_date?.[0]);
    const hasGroupsObject =
      chap.groups &&
      typeof chap.groups === "object" &&
      !Array.isArray(chap.groups);
    if (hasGroupsObject) {
      const groupEntries = Object.entries(chap.groups);
      for (const [groupId] of groupEntries) {
        const groupName = manifest.groups?.[groupId] || groupId;
        const chapterId = buildChapterId(type, id, chapNo, groupId);
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
      const chapterId = buildChapterId(type, id, chapNo, ".");
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

function normalizePagesArray(arr: any[]): { url: string }[] {
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

export function extractPagesFromChapter(
  chap: any,
  groupName?: string
): { url: string }[] {
  if (Array.isArray(chap)) {
    return normalizePagesArray(chap);
  }
  if (Array.isArray(chap?.pages)) {
    return normalizePagesArray(chap.pages);
  }
  const commonKeys = ["images", "urls", "links", "data"];
  for (const key of commonKeys) {
    if (Array.isArray(chap?.[key])) {
      return normalizePagesArray(chap[key]);
    }
  }
  const groups = chap?.groups ?? chap?.group;
  if (groups) {
    if (Array.isArray(groups)) {
      return normalizePagesArray(groups);
    }
    if (typeof groups === "object") {
      let selected: any;
      if (groupName && groups[groupName]) selected = groups[groupName];
      if (!selected) {
        const names = Object.keys(groups);
        if (names.length > 0) selected = groups[names[0]];
      }
      if (Array.isArray(selected)) return normalizePagesArray(selected);
      if (selected && typeof selected === "object") {
        for (const key of ["pages", ...commonKeys]) {
          if (Array.isArray(selected[key])) {
            return normalizePagesArray(selected[key]);
          }
        }
        const values = Object.values(selected);
        const stringValues = values.filter(
          (v) => typeof v === "string"
        ) as string[];
        if (stringValues.length) return normalizePagesArray(stringValues);
        const objectUrlItems = values
          .map((o: any) => o?.url ?? o?.u ?? o?.src ?? o?.link)
          .filter((u: any): u is string => typeof u === "string");
        if (objectUrlItems.length) return normalizePagesArray(objectUrlItems);
        const firstArray = values.find((v: any) => Array.isArray(v)) as
          | any[]
          | undefined;
        if (firstArray) return normalizePagesArray(firstArray);
      }
    }
  }
  return [];
}

export function selectGroupValue(chap: any, groupName?: string): any {
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

export async function fetchProxyPages(
  link: string,
  fetcher: (url: string) => Promise<string>
): Promise<{ url: string }[]> {
  const url = link.startsWith("http")
    ? link
    : `https://cubari.moe${link.startsWith("/") ? "" : "/"}${link}`;
  try {
    const text = await fetcher(url);
    const data = JSON.parse(text);
    if (Array.isArray(data)) return normalizePagesArray(data);
    const commonKeys = ["images", "pages", "data"];
    for (const key of commonKeys) {
      if (Array.isArray(data?.[key])) {
        return normalizePagesArray(data[key]);
      }
    }
    if (data && typeof data === "object") {
      const values = Object.values(data);
      const firstArray = values.find((v: any) => Array.isArray(v)) as
        | any[]
        | undefined;
      if (firstArray) return normalizePagesArray(firstArray);
    }
  } catch {}
  const html = await fetcher(url);
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
