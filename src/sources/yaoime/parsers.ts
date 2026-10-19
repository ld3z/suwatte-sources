import {
  Chapter,
  ChapterPage,
  Content,
  ContentRating,
  ContentStatus,
  ContentType,
  Credit,
  Item,
  PagedItemList,
  ReadingMode,
  Tag,
} from "@suwatte/toolchain";
import { load } from "cheerio/slim";

import { BASE_URL, COVER_WIDTH, PAGE_WIDTH } from "./constants";
import { languageCode, nonEmpty, parseAbsoluteDate, sizedImage } from "./utils";

export interface ChapterGroup {
  key?: string;
  label: string;
  num: number;
  createdAt?: number;
  variants: ChapterVariant[];
}

export interface ChapterVariant {
  id: number;
  s: number;
  lang?: string;
}

export interface ReaderPage {
  hashes: string[];
  sealed?: string;
  build?: string;
  scripts: string[];
}

const SERIES_HREF = /\/series\/(\d+)(?:\/([^/?#]+))?/;
const CHAPTER_HREF = /\/chapter\/(\d+)\/(\d+)/;

const MATURE_GENRES = [
  "adult",
  "erotica",
  "mature",
  "pornographic",
  "smut",
  "lolicon",
  "shotacon",
];
const SUGGESTIVE_GENRES = ["suggestive", "ecchi"];

export function seriesUrl(id: string, slug?: string): string {
  return slug ? `${BASE_URL}/series/${id}/${slug}` : `${BASE_URL}/series/${id}`;
}

export function chapterUrl(chapterId: string): string {
  return `${BASE_URL}/chapter/${chapterId}`;
}

/**
 * Extracts a series id from a pasted `yaoi.me/series/{id}` URL.
 * Chapter URLs are returned as `chapter:{seriesId}/{chapterId}` so search can
 * resolve them to the canonical title.
 */
export function parseDeepLinkId(query: string): string | null {
  const trimmed = query.trim();
  const series = trimmed.match(/yaoi\.me\/series\/(\d+)/i);
  if (series) return series[1];
  const chapter = trimmed.match(/yaoi\.me\/chapter\/(\d+)\/(\d+)/i);
  if (chapter) return `chapter:${chapter[1]}/${chapter[2]}`;
  return /^\d+$/.test(trimmed) ? trimmed : null;
}

export function parseSeriesId(href?: string): string | null {
  const match = href?.match(SERIES_HREF);
  return match ? match[1] : null;
}

export function parseChapterId(href?: string): string | null {
  const match = href?.match(CHAPTER_HREF);
  return match ? `${match[1]}/${match[2]}` : null;
}

// ================================ Listings ================================

export function parseListing(html: string): PagedItemList {
  const $ = load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $("a.card-title[href*='/series/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const id = parseSeriesId(href);
    if (!id || seen.has(id)) return;
    seen.add(id);

    const title =
      $(el).attr("title")?.trim() || $(el).text().trim() || id;
    const $card = $(el).parent();
    const chapters = $card.find(".card-chapters").first().text().trim();
    const cover = $(`a[href*="/series/${id}"] img[src*="/i/c/"]`).first();
    const mature =
      /\btext-mature\b/.test($(el).attr("class") ?? "") ||
      $(`a[href*="/series/${id}"]`).hasClass("mature-cover");

    items.push({
      id,
      title,
      subtitle: chapters || undefined,
      coverImage: sizedImage(cover.attr("src") ?? "", COVER_WIDTH) || undefined,
      webUrl: seriesUrl(id, href.match(SERIES_HREF)?.[2]),
      rating: mature ? ContentRating.MATURE : ContentRating.EVERYONE,
    });
  });

  const next = $("nav[aria-label='Pagination'] a").filter((_, a) =>
    /^next$/i.test($(a).text().trim())
  );

  return {
    items,
    isLastPage: next.length === 0,
  };
}

/** Series id linked from a chapter page's title control. */
export function parseSeriesIdFromChapterPage(html: string): string | null {
  const $ = load(html);
  const href =
    $("a[href*='/series/']")
      .filter((_, a) => /title/i.test($(a).attr("aria-label") ?? $(a).text()))
      .first()
      .attr("href") ??
    $("a[href*='/series/']").first().attr("href");
  return parseSeriesId(href);
}

// ================================ Content =================================

interface JsonLdSeries {
  "@type"?: string;
  name?: string;
  alternateName?: string | string[];
  url?: string;
  image?: string;
  description?: string;
  author?: { name?: string } | { name?: string }[];
  genre?: string | string[];
  contentRating?: string;
  isFamilyFriendly?: boolean;
  startDate?: string;
}

export function parseContent(html: string, contentId: string): Content {
  const $ = load(html);
  const ld = parseJsonLd($);
  const info = parseInfoRows($);

  const title =
    ld?.name?.trim() || $("h1").first().text().trim() || contentId;
  const slug = (ld?.url ?? $("link[rel='canonical']").attr("href"))?.match(
    SERIES_HREF
  )?.[2];
  const webUrl = seriesUrl(contentId, slug);

  const cover =
    sizedImage(ld?.image ?? $("img[src*='/i/c/']").eq(1).attr("src") ?? $("img[src*='/i/c/']").first().attr("src") ?? "", COVER_WIDTH);

  const genreNames = asList(ld?.genre);
  const genres: Tag[] = genreNames.map((name) => ({
    id: name,
    title: name,
  }));
  if (genres.length === 0) {
    $("a[href*='genre=']").each((_, a) => {
      const name = $(a).text().trim();
      if (name && !genres.some((g) => g.title === name)) {
        genres.push({ id: name, title: name });
      }
    });
  }

  const authors = asAuthors(ld?.author);
  $("a[href*='/author/']").each((_, a) => {
    const name = $(a).text().trim();
    if (name && !authors.some((c) => c.name === name)) {
      authors.push({ name, role: "Author" });
    }
  });

  const format = info.get("format") ?? "";
  const contentType = parseContentType(format);
  const additionalTitles = asList(ld?.alternateName).filter((t) => t && t !== title);
  const details: Record<string, string> = {};
  for (const key of ["Published", "Length", "Original", "Publishers"]) {
    const value = info.get(key.toLowerCase());
    if (value) details[key] = value;
  }

  const scoreText = $("body").text().match(/([\d.]+)\s*score/i)?.[1];
  const ratingValue = scoreText ? Number(scoreText) : undefined;

  return {
    title,
    coverImage: cover,
    webUrl,
    rating: parseContentRating($, ld, genres),
    status: parseStatus(info.get("status")),
    contentType,
    readingMode: parseReadingMode(contentType, format),
    summary: ld?.description?.trim() || parseSynopsis($) || undefined,
    additionalTitles: nonEmpty(additionalTitles),
    credits: nonEmpty(authors),
    genres: nonEmpty(genres),
    additionalDetails: Object.keys(details).length > 0 ? details : undefined,
    statistics:
      ratingValue && ratingValue > 0 ? { rating: ratingValue } : undefined,
    links: [{ title: "Website", url: webUrl }],
  };
}

function parseJsonLd(
  $: ReturnType<typeof load>
): JsonLdSeries | undefined {
  for (const el of $("script[type='application/ld+json']").toArray()) {
    try {
      const data = JSON.parse($(el).text());
      const entries: JsonLdSeries[] = Array.isArray(data) ? data : [data];
      const series = entries.find((e) => e?.["@type"] === "ComicSeries");
      if (series) return series;
    } catch {
      // Ignore malformed JSON-LD.
    }
  }
  return undefined;
}

function parseInfoRows($: ReturnType<typeof load>): Map<string, string> {
  const info = new Map<string, string>();
  $("dt").each((_, dt) => {
    const key = $(dt).text().trim().toLowerCase();
    const value = $(dt).next("dd").text().replace(/\s+/g, " ").trim();
    if (key && value) info.set(key, value);
  });
  return info;
}

function parseSynopsis($: ReturnType<typeof load>): string {
  const heading = $("h2, h3")
    .filter((_, el) => /synopsis/i.test($(el).text()))
    .first();
  return heading.nextAll("p").first().text().trim();
}

function asList(value?: string | string[]): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value])
    .map((v) => v.trim())
    .filter(Boolean);
}

function asAuthors(
  value?: { name?: string } | { name?: string }[]
): Credit[] {
  return asList(
    (Array.isArray(value) ? value : value ? [value] : [])
      .map((a) => a.name ?? "")
  ).map((name) => ({ name, role: "Author" }));
}

function parseContentRating(
  $: ReturnType<typeof load>,
  ld: JsonLdSeries | undefined,
  genres: Tag[]
): ContentRating {
  const names = genres.map((g) => g.title.toLowerCase());
  const ldRating = ld?.contentRating?.toLowerCase() ?? "";
  if (
    ld?.isFamilyFriendly === false ||
    /adult|erotica|pornographic/.test(ldRating) ||
    $("h1").first().hasClass("text-mature") ||
    names.some((n) => MATURE_GENRES.includes(n))
  ) {
    return ContentRating.MATURE;
  }
  if (names.some((n) => SUGGESTIVE_GENRES.includes(n)) || ldRating === "suggestive") {
    return ContentRating.SUGGESTIVE;
  }
  return ContentRating.EVERYONE;
}

function parseStatus(status?: string): ContentStatus {
  switch (status?.toLowerCase()) {
    case "ongoing":
    case "releasing":
      return ContentStatus.ONGOING;
    case "completed":
      return ContentStatus.COMPLETED;
    case "hiatus":
      return ContentStatus.HIATUS;
    case "canceled":
    case "cancelled":
      return ContentStatus.CANCELLED;
    default:
      return ContentStatus.UNKNOWN;
  }
}

function parseContentType(format: string): ContentType {
  switch (format.toLowerCase().trim()) {
    case "manhwa":
      return ContentType.MANHWA;
    case "manhua":
      return ContentType.MANHUA;
    case "novel":
      return ContentType.NOVEL;
    case "oel":
    case "other":
    case "doujinshi":
      return ContentType.COMIC;
    default:
      return ContentType.MANGA;
  }
}

function parseReadingMode(type: ContentType, format: string): ReadingMode {
  if (/webtoon/i.test(format)) return ReadingMode.VERTICAL;
  switch (type) {
    case ContentType.MANHWA:
    case ContentType.MANHUA:
      return ReadingMode.VERTICAL;
    case ContentType.MANGA:
      return ReadingMode.PAGED_MANGA;
    default:
      return ReadingMode.PAGED_COMIC;
  }
}

// =============================== Chapters ===============================

const NUMBERED_LABEL =
  /^(?:vol(?:ume)?\.?\s*\d+(?:\.\d+)?\s*)?(?:chapter|chap|ch|episode|ep)\.?\s*\d+(?:\.\d+)?/i;

/** Next.js RSC payload: concatenated `self.__next_f.push([1, "..."])` strings. */
function flightData(html: string): string {
  let output = "";
  const pushes = html.matchAll(/self\.__next_f\.push\(\[1,("[\s\S]*?")\]\)/g);
  for (const match of pushes) {
    try {
      output += JSON.parse(match[1]) as string;
    } catch {
      // Ignore a truncated flight row.
    }
  }
  return output;
}

/** The JSON value opening at start, read past brackets that sit inside strings. */
function sliceJson(payload: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < payload.length; index++) {
    const character = payload[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
    } else if (character === "[" || character === "{") {
      depth++;
    } else if (character === "]" || character === "}") {
      depth--;
      if (depth === 0) return payload.slice(start, index + 1);
    }
  }
  return undefined;
}

function isChapterGroup(value: unknown): value is ChapterGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<ChapterGroup>;
  return (
    typeof group.label === "string" &&
    typeof group.num === "number" &&
    Array.isArray(group.variants)
  );
}

function chapterNumber(group: ChapterGroup): number {
  const fromKey = group.key?.match(/(?:^n:|@|:)(\d+(?:\.\d+)?)$/);
  if (fromKey) return Number(fromKey[1]);
  return parseChapterLabel(group.label).number || group.num;
}

function sourceName(key: string, occurrence: number, uploads: number): string | undefined {
  if (!key) return undefined;
  const name = key.charAt(0).toUpperCase() + key.slice(1);
  return uploads > 1 ? `${name} (${occurrence})` : name;
}

/**
 * The HTML only renders the first chapter rows. The full list, including every
 * upload of each chapter, is the chapter component's data in the page payload.
 */
export function parseChapters(html: string): Chapter[] {
  const payload = flightData(html);
  const groupsAt = payload.indexOf('"groups":[{');
  const groupsJson = groupsAt >= 0 ? sliceJson(payload, groupsAt + '"groups":'.length) : undefined;
  if (groupsJson) {
    const sourcesAt = payload.indexOf('"sources":{', groupsAt);
    const sourcesJson =
      sourcesAt >= 0 ? sliceJson(payload, sourcesAt + '"sources":'.length) : undefined;
    try {
      const groups = (JSON.parse(groupsJson) as unknown[]).filter(isChapterGroup);
      const sources: Record<string, string> = sourcesJson ? JSON.parse(sourcesJson) : {};
      const chapters = groups.flatMap((group) => {
        const variants = group.variants.filter(
          (variant) => typeof variant?.id === "number" && typeof variant.s === "number"
        );
        const uploadsPerSource = new Map<number, number>();
        for (const variant of variants) {
          uploadsPerSource.set(variant.s, (uploadsPerSource.get(variant.s) ?? 0) + 1);
        }
        const numbered = new Map<number, number>();
        const parsed = parseChapterLabel(group.label);
        const number = chapterNumber(group);
        const date = group.createdAt ? new Date(group.createdAt) : undefined;
        const title = chapterTitle(group.label);
        return variants.map((variant) => {
          const key = sources[String(variant.s)] ?? "";
          const occurrence = (numbered.get(variant.s) ?? 0) + 1;
          numbered.set(variant.s, occurrence);
          const name = sourceName(key, occurrence, uploadsPerSource.get(variant.s) ?? 0);
          const id = `${variant.s}/${variant.id}`;
          return {
            id,
            index: 0,
            number,
            volume: parsed.volume,
            title,
            language: languageCode(variant.lang),
            date: date && !isNaN(date.getTime()) ? date : undefined,
            webUrl: chapterUrl(id),
            providers: name
              ? [{ id: key || String(variant.s), name, links: [] }]
              : undefined,
          } satisfies Chapter;
        });
      });
      chapters.forEach((chapter, index) => {
        chapter.index = index;
      });
      if (chapters.length) return chapters;
    } catch {
      // Fall back to the visible rows if the payload cannot be read.
    }
  }
  return parseVisibleChapters(html);
}

function parseVisibleChapters(html: string): Chapter[] {
  const $ = load(html);
  const seen = new Set<string>();
  const chapters: Chapter[] = [];

  $("a.hit[href*='/chapter/']").each((_, a) => {
    const $a = $(a);
    const id = parseChapterId($a.attr("href"));
    if (!id || seen.has(id)) return;
    seen.add(id);

    const label = $a.find("b").first().text().trim() || $a.text().trim();
    if (!label) return;

    const $row = $a.parent();
    const parsed = parseChapterLabel(label);
    const flag = $row.find(".ch-flags img").first();
    const source = $row
      .find(".ch-src")
      .first()
      .text()
      .replace(/^#\d+\s*/, "")
      .trim();

    chapters.push({
      id,
      index: 0,
      number: parsed.number,
      volume: parsed.volume,
      title: parsed.title,
      language: languageCode(flag.attr("title") || flag.attr("aria-label")),
      date: parseAbsoluteDate($row.text()),
      webUrl: chapterUrl(id),
      providers: source
        ? [{ id: source.toLowerCase().replace(/\s+/g, "-"), name: source, links: [] }]
        : undefined,
    });
  });

  chapters.forEach((chapter, index) => {
    chapter.index = index;
  });
  return chapters;
}

/** "Vol.2 Ch.1.5" is only a number; "Ch.5: The Fall" keeps the title. */
function chapterTitle(label: string): string | undefined {
  const prefix = NUMBERED_LABEL.exec(label);
  if (!prefix) return label || undefined;
  const rest = label.slice(prefix[0].length).trim();
  if (!rest) return undefined;
  return /^[-–—:]\s*(\D.*)$/.exec(rest)?.[1] ?? (rest ? label : undefined);
}

/**
 * Reads volume/chapter numbers from labels like "Vol.6 Ch.48", "Ch.48.5",
 * or "Chapter 29 v2". Unnumbered extras keep the full label as their title.
 */
export function parseChapterLabel(label: string): {
  number: number;
  volume?: number;
  title?: string;
} {
  const volume = label.match(/\bVol\.?\s*(\d+(?:\.\d+)?)/i);
  const chapter = label.match(/\b(?:Ch\.?|Chapter)\s*(\d+(?:\.\d+)?)/i);
  const volumeNumber = volume ? Number(volume[1]) : undefined;
  if (chapter) {
    const rest = label
      .replace(/\bVol\.?\s*\d+(?:\.\d+)?/i, "")
      .replace(/\b(?:Ch\.?|Chapter)\s*\d+(?:\.\d+)?/i, "")
      .replace(/^[\s:·\-–]+/, "")
      .trim();
    return {
      number: Number(chapter[1]),
      volume: volumeNumber,
      title: rest || undefined,
    };
  }
  return { number: 0, volume: volumeNumber, title: label };
}

// ============================= Chapter Pages ==============================

export function parseChapterPages(html: string): ChapterPage[] {
  return parseReaderPage(html).hashes.map((hash) => ({
    url: `${BASE_URL}/i/p/${hash}?w=${PAGE_WIDTH}`,
  }));
}

/** A sealed page list is either inline or a text row (`:T,`) it points at. */
function sealedValue(payload: string): string | undefined {
  const value = payload.match(/"sealed":"([^"]+)"/)?.[1];
  if (!value?.startsWith("$")) return value;
  const header = new RegExp(`(?:^|\\n)${value.slice(1)}:T([0-9a-f]+),`, "i").exec(payload);
  if (!header) return undefined;
  const start = header.index + header[0].length;
  return payload.slice(start, start + Number.parseInt(header[1], 16));
}

/**
 * The page list is sealed on most chapters. The key lives in one of the
 * reader's scripts and changes with each deploy, so the build id and script
 * list come along to find it.
 */
export function parseReaderPage(html: string): ReaderPage {
  const $ = load(html);
  const payload = flightData(html);
  const pages = payload.match(/"pages":\[([\s\S]*?)],"chapters"/)?.[1] ?? "";
  const hashes: string[] = [...pages.matchAll(/"hash":"([^"]+)"/g)].map((match) => match[1]);
  if (hashes.length === 0) {
    const seen = new Set<string>();
    const add = (src?: string) => {
      const hash = src?.match(/\/i\/p\/([^/?#]+)/)?.[1];
      if (!hash || seen.has(hash)) return;
      seen.add(hash);
      hashes.push(hash);
    };
    $("img[alt^='Page']").each((_, img) => add($(img).attr("src")));
    if (hashes.length === 0) {
      $("img[src*='/i/p/']").each((_, img) => add($(img).attr("src")));
    }
  }

  const scripts = new Set<string>();
  for (const match of payload.matchAll(/\/_next\/static\/chunks\/[\w.-]+\.js/g)) {
    scripts.add(match[0]);
  }
  $("script[src*='/_next/static/chunks/']").each((_, element) => {
    const src = $(element).attr("src");
    if (src) scripts.add(src.replace(/^https?:\/\/[^/]+/i, ""));
  });

  return {
    hashes,
    sealed: sealedValue(payload),
    build: payload.match(/"b":"([^"]+)"/)?.[1],
    scripts: [...scripts],
  };
}

const BYTE_LIST = "(\\d{1,3}(?:,\\d{1,3}){31})";

/** The script exports sealKey as a 32-byte list, sometimes XORed with a mask. */
export function parseSealKey(script: string): string | undefined {
  const at = script.indexOf('"sealKey"');
  if (at < 0) return undefined;
  const start = Math.max(0, script.lastIndexOf('"use strict"', at));
  const module = script.slice(start, at + 400);
  const bytes = (list: string) => list.split(",").map(Number);
  const keyList = new RegExp(`"sealKey",0,\\(\\)=>\\w*\\(?\\[${BYTE_LIST}\\]`).exec(module)?.[1];
  if (!keyList) return undefined;
  const maskName = /=>\w+\^(\w+)\[\w+\]/.exec(module)?.[1];
  const maskList = maskName
    ? new RegExp(`\\b${maskName}=\\[${BYTE_LIST}\\]`).exec(module)?.[1]
    : undefined;
  const mask = maskList ? bytes(maskList) : [];
  return bytes(keyList)
    .map((byte, index) => (byte ^ (mask[index] ?? 0)).toString(16).padStart(2, "0"))
    .join("");
}
