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

import {
  BASE_URL,
  MATURE_TAG_IDS,
  SUGGESTIVE_TAG_IDS,
} from "./constants";
import {
  absoluteUrl,
  nonEmpty,
  parseReleaseDate,
  seriesSlugFromChapterSlug,
  splitChapterLabel,
} from "./utils";

type Query = ReturnType<typeof load>;
type Scope = ReturnType<Query>;

const SLUG = "[A-Za-z0-9_]+";
const SERIES_HREF = new RegExp(`^/series/(${SLUG})`);
const CHAPTERS_HREF = new RegExp(`^/chapters/(${SLUG})`);
const ENTRY_HREF = new RegExp(`^/(series|doujins|tags|chapters)/(${SLUG})`);
const TAG_HREF = /\/tags\/([a-z0-9_]+)/;

/** Content id kinds; each maps to its own site path. */
export type ContentKind = "series" | "doujins" | "tags" | "chapter";

export function parseContentId(contentId: string): {
  kind: ContentKind;
  slug: string;
} {
  const match = new RegExp(`^(${SLUG})/(${SLUG})$`).exec(contentId);
  if (!match) throw new Error(`Unrecognized content id: ${contentId}`);
  return { kind: match[1] as ContentKind, slug: match[2] };
}

export function contentUrl(contentId: string): string {
  const { kind, slug } = parseContentId(contentId);
  return `${BASE_URL}/${kind === "chapter" ? "chapters" : kind}/${slug}`;
}

/** Content id behind a listing/deep-link href; serialized chapters map to their series. */
export function idFromHref(href: string): string | null {
  const match = ENTRY_HREF.exec(href);
  if (!match) return null;
  const [, path, slug] = match;
  if (path === "chapters") {
    const series = seriesSlugFromChapterSlug(slug);
    return series ? `series/${series}` : `chapter/${slug}`;
  }
  return `${path}/${slug}`;
}

/** Series id behind a chapter permalink, keeping standalone releases as chapters. */
export function seriesIdFromChapterSlug(slug: string): string | null {
  const series = seriesSlugFromChapterSlug(slug);
  return series ? `series/${series}` : null;
}

/** Resolves a pasted dynasty-scans.com URL to a content id. */
export function parseDeepLinkId(query: string): string | null {
  const match = /dynasty-scans\.com\/(series|doujins|tags|chapters)\/([A-Za-z0-9_]+)/i.exec(
    query.trim()
  );
  if (!match) return null;
  if (match[1].toLowerCase() === "chapters") {
    return seriesIdFromChapterSlug(match[2]) ?? `chapter/${match[2]}`;
  }
  return `${match[1].toLowerCase()}/${match[2]}`;
}

// ================================== Tags ===================================

function tagIdsFrom($: Query, scope: Scope): string[] {
  const ids: string[] = [];
  scope.find("a[href*='/tags/']").each((_, a) => {
    const id = TAG_HREF.exec($(a).attr("href") ?? "")?.[1];
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

export function ratingFromTags(ids: string[]): ContentRating {
  if (ids.some((id) => MATURE_TAG_IDS.includes(id))) return ContentRating.MATURE;
  if (ids.some((id) => SUGGESTIVE_TAG_IDS.includes(id))) return ContentRating.SUGGESTIVE;
  return ContentRating.EVERYONE;
}

/** Splits a Dynasty tag cloud into genres, pairings, and the doujin franchise. */
function classifyTags(
  $: Query,
  scope: Scope
): { genres: Tag[]; pairings: Tag[]; franchise?: string } {
  const genres: Tag[] = [];
  const pairings: Tag[] = [];
  let franchise: string | undefined;
  scope.find("a").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const title = $(a).text().replace(/\s+/g, " ").trim();
    if (!title) return;
    if (href.includes("/pairings/")) {
      if (!pairings.some((tag) => tag.title === title)) {
        pairings.push({ id: title, title });
      }
    } else if (href.includes("/doujins/")) {
      franchise ||= title.replace(/\s+Doujin$/i, "");
    } else if (TAG_HREF.test(href)) {
      if (!genres.some((tag) => tag.title === title)) {
        genres.push({ id: title, title });
      }
    }
  });
  return { genres, pairings, franchise };
}

function readingModeFrom(genreIds: string[]): ReadingMode {
  if (genreIds.includes("long_strip")) return ReadingMode.VERTICAL;
  if (genreIds.includes("read_left_to_right")) return ReadingMode.PAGED_COMIC;
  return ReadingMode.PAGED_MANGA;
}

// ================================ Pagination ================================

function hasNextPage($: Query): boolean {
  return $("div.pagination a[rel='next']").length > 0;
}

// ================================ Listings =================================

/** Chapter cards from the home page, plus the featured-series card. */
export function parseHomepage(html: string): PagedItemList {
  const $ = load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $("a.chapter.media.thumbnail").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const seriesHref = SERIES_HREF.exec(href)?.[1];
    const chapterHref = CHAPTERS_HREF.exec(href)?.[1];
    if (!seriesHref && !chapterHref) return;

    const id = seriesHref
      ? `series/${seriesHref}`
      : seriesIdFromChapterSlug(chapterHref!) ?? `chapter/${chapterHref!}`;
    if (seen.has(id)) return;
    seen.add(id);

    const label = $(el).find(".title").first().text().replace(/\s+/g, " ").trim();
    const split = splitChapterLabel(label);

    items.push({
      id,
      title: split.title,
      subtitle: split.chapter,
      coverImage:
        absoluteUrl($(el).find("img").first().attr("src") ?? "") || undefined,
      webUrl: seriesHref
        ? `${BASE_URL}/series/${seriesHref}`
        : `${BASE_URL}/chapters/${chapterHref}`,
      rating: ratingFromTags(tagIdsFrom($, $(el))),
    });
  });

  return { items, isLastPage: !hasNextPage($) };
}

/** `dl.chapter-list` entry rows from search result and "Recently Added" pages. */
export function parseEntryList(html: string): PagedItemList {
  const $ = load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $("dl.chapter-list dd a.name").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const id = idFromHref(href);
    if (!id || seen.has(id)) return;
    seen.add(id);

    const label = $(el).text().replace(/\s+/g, " ").trim();
    const row = $(el).parent();
    const authors = row
      .find("a[href*='/authors/']")
      .map((_, a) => $(a).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);
    const mappedToSeries =
      !!CHAPTERS_HREF.exec(href)?.[1] &&
      !!seriesSlugFromChapterSlug(CHAPTERS_HREF.exec(href)![1]);

    items.push({
      id,
      title: label,
      subtitle: authors.length
        ? authors.join(", ")
        : mappedToSeries
          ? splitChapterLabel(label).chapter
          : undefined,
      webUrl: contentUrl(id),
      rating: ratingFromTags(tagIdsFrom($, row)),
    });
  });

  return { items, isLastPage: !hasNextPage($) };
}

// =============================== Tag pages ==================================

function parseStatus(text: string): ContentStatus {
  const status = text.split("—").pop()?.trim().toLowerCase() ?? "";
  switch (status) {
    case "ongoing":
      return ContentStatus.ONGOING;
    case "completed":
      return ContentStatus.COMPLETED;
    case "hiatus":
      return ContentStatus.HIATUS;
    case "cancelled":
    case "dropped":
      return ContentStatus.CANCELLED;
    default:
      return ContentStatus.UNKNOWN;
  }
}

/** Series, doujin, and tag pages share the `.tags.show` layout. */
export function parseTagPageContent(html: string, contentId: string): Content {
  const $ = load(html);
  const heading = $("h2.tag-title").first();
  const title =
    heading.find("b").first().text().replace(/\s+/g, " ").trim() ||
    parseContentId(contentId).slug;

  const credits = heading
    .find("a[href*='/authors/']")
    .map((_, a) => ({
      name: $(a).text().replace(/\s+/g, " ").trim(),
      role: "Author",
    }))
    .get()
    .filter((credit) => credit.name);

  const statusText = heading
    .find("small")
    .filter((_, el) => $(el).text().includes("—"))
    .last()
    .text();

  const additionalTitles = $("p.aliases b")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((alias) => alias && alias !== title);

  const { genres, pairings, franchise } = classifyTags(
    $,
    $(".tag-tags").first()
  );
  const genreIds = genres.map((tag) => tag.id.toLowerCase());

  const webUrl = contentUrl(contentId);
  return {
    title,
    coverImage: absoluteUrl($("div.cover img").first().attr("src") ?? ""),
    webUrl,
    rating: ratingFromTags(genreIds),
    status: parseStatus(statusText),
    contentType: ContentType.MANGA,
    readingMode: readingModeFrom(genreIds),
    credits: nonEmpty(credits),
    additionalTitles: nonEmpty(additionalTitles),
    genres: nonEmpty(genres),
    properties: pairings.length
      ? [{ id: "pairings", title: "Pairings", tags: pairings }]
      : undefined,
    additionalDetails: franchise ? { Franchise: franchise } : undefined,
    links: [{ title: "Website", url: webUrl }],
  };
}

/** Parses "Chapter 10: The Fall" labels; unnumbered rows keep the label as title. */
export function parseChapterName(label: string): {
  number: number;
  title?: string;
} {
  const match = /^(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)(?::\s*([\s\S]*))?$/i.exec(
    label.replace(/\s+/g, " ").trim()
  );
  if (!match) return { number: -1, title: label || undefined };
  const title = match[2]?.trim();
  return { number: Number(match[1]), title: title || undefined };
}

/** Chapter rows grouped by `dt` headers ("Volume 1", event groups); newest first. */
export function parseTagPageChapters(html: string): Chapter[] {
  const $ = load(html);
  const chapters: Chapter[] = [];
  let volume: number | undefined;
  let special = false;

  $("dl.chapter-list").first().children().each((_, child) => {
    const element = $(child);
    if (/^dt$/i.test((child as { tagName?: string }).tagName ?? "")) {
      const label = element.text().replace(/\s+/g, " ").trim();
      const volMatch = /^volume\s*(\d+(?:\.\d+)?)$/i.exec(label);
      volume = volMatch ? Number(volMatch[1]) : undefined;
      special = !volMatch;
      return;
    }

    const link = element.find("a.name").first();
    const slug = CHAPTERS_HREF.exec(link.attr("href") ?? "")?.[1];
    if (!slug) return;

    const parsed = parseChapterName(link.text());
    chapters.push({
      id: slug,
      index: 0,
      number: parsed.number,
      volume,
      title: parsed.title,
      isSpecial: special || parsed.number < 0,
      date: parseReleaseDate(element.text()),
      webUrl: `${BASE_URL}/chapters/${slug}`,
    });
  });

  chapters.reverse().forEach((chapter, index) => {
    chapter.index = index;
  });
  return chapters;
}

// ============================ Chapter pages =================================

/** The reader embeds its page list as a JSON array in `var pages = [...]`. */
export function parseReaderPageList(html: string): string[] {
  const payload = /var pages = (\[[\s\S]*?\]);/.exec(html)?.[1];
  if (payload) {
    try {
      const pages = JSON.parse(payload) as { image?: string }[];
      const urls = pages
        .map((page) => absoluteUrl(page.image ?? ""))
        .filter(Boolean);
      if (urls.length) return urls;
    } catch {
      // Fall back to the visible reader image.
    }
  }
  const single = absoluteUrl(
    load(html)("div#image img").first().attr("src") ?? ""
  );
  return single ? [single] : [];
}

export function toChapterPages(urls: string[]): ChapterPage[] {
  return urls.map((url) => ({ url }));
}

export interface StandaloneChapter {
  content: Content;
  chapter: Chapter;
  pages: string[];
}

/** Standalone doujins and anthology stories live on their chapter page. */
export function parseStandaloneChapter(
  html: string,
  slug: string
): StandaloneChapter {
  const $ = load(html);
  const pages = parseReaderPageList(html);
  const heading = $("#chapter-title").first();

  let title = heading.find("b").first().text().replace(/\s+/g, " ").trim();
  const parent = heading
    .find("b a[href*='/series/'], b a[href*='/tags/'], b a[href*='/doujins/']")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (parent && title.startsWith(parent)) {
    title = title.slice(parent.length).trim();
  }
  const split = splitChapterLabel(title);
  title = split.title || title;
  const chapterNumber = split.chapter
    ? Number(split.chapter.match(/^ch(\d+(?:[._]\d+)?)/i)?.[1]?.replace("_", ".")) || 1
    : 1;

  const credits = [
    ...heading
      .find("a[href*='/authors/']")
      .map((_, a) => ({
        name: $(a).text().replace(/\s+/g, " ").trim(),
        role: "Author",
      }))
      .get(),
    ...$("#chapter-details .scanlators a")
      .map((_, a) => ({
        name: $(a).text().replace(/\s+/g, " ").trim(),
        role: "Scanlator",
      }))
      .get(),
  ].filter((credit) => credit.name);

  const franchise = $("#chapter-details .volumes a")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const { genres, pairings } = classifyTags(
    $,
    $("#chapter-details .tags").first()
  );
  const genreIds = genres.map((tag) => tag.id.toLowerCase());

  const webUrl = `${BASE_URL}/chapters/${slug}`;
  const content: Content = {
    title,
    coverImage: pages[0] ?? "",
    webUrl,
    rating: ratingFromTags(genreIds),
    status: ContentStatus.COMPLETED,
    contentType: ContentType.MANGA,
    readingMode: readingModeFrom(genreIds),
    credits: nonEmpty(credits),
    genres: nonEmpty(genres),
    properties: pairings.length
      ? [{ id: "pairings", title: "Pairings", tags: pairings }]
      : undefined,
    additionalDetails: franchise
      ? { Franchise: franchise.replace(/\s+Doujin$/i, "") }
      : undefined,
    links: [{ title: "Website", url: webUrl }],
  };

  return {
    content,
    chapter: {
      id: slug,
      index: 0,
      number: chapterNumber,
      title: split.chapter,
      date: parseReleaseDate($("#chapter-details .released").text()),
      webUrl,
    },
    pages,
  };
}
