import {
  Chapter,
  Content,
  ContentRating,
  ContentStatus,
  ContentType,
  Credit,
  Item,
  PagedItemList,
  Statistics,
  Tag,
} from "@suwatte/toolchain";
import { load } from "cheerio/slim";

import { BASE_URL, PAGE_LIMIT } from "./constants";
import {
  NovelBuddyChapter,
  NovelBuddySearchResponse,
  NovelBuddyTitle,
  NovelBuddyTitleItem,
} from "./types";
import { escapeHtml, nonEmpty, parseChapterNumber, parseDate } from "./utils";

const MATURE_GENRES = ["adult", "smut"];
const SUGGESTIVE_GENRES = ["mature", "ecchi"];

/** Tags that can carry chapter text; everything else (empty divs, scripts) is dropped. */
const TEXT_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "hr", "ul", "ol", "table", "pre",
]);

/** First path segments that are site pages rather than novels. */
const RESERVED_PATHS = new Set([
  "home", "search", "latest", "genres", "ranking", "lists", "hall-of-fame",
  "auth", "me", "users", "titles", "tags", "top", "trending", "popular",
]);

export function novelUrl(slug: string): string {
  return `${BASE_URL}/${slug}`;
}

/**
 * Extracts a novel slug from a pasted `novelbuddy.me/{slug}` or
 * `novelbuddy.me/titles/{id}-{slug}` URL, ignoring any chapter segment.
 */
export function parseDeepLinkSlug(query: string): string | null {
  const titles = query.match(/novelbuddy\.me\/titles\/[A-Za-z0-9]+-([a-z0-9-]+)/i);
  if (titles) return titles[1];
  const plain = query.match(/novelbuddy\.me\/([a-z0-9-]+)(?:[/?#]|$)/i);
  return plain && !RESERVED_PATHS.has(plain[1].toLowerCase()) ? plain[1] : null;
}

// ================================ Items =================================

export function toItem(item: NovelBuddyTitleItem): Item {
  const chapters = item.stats?.chapters_count;
  return {
    id: item.slug,
    title: decodeEntities(item.name),
    subtitle: typeof chapters === "number" ? `${chapters} Chapters` : undefined,
    coverImage: item.cover || undefined,
    webUrl: novelUrl(item.slug),
    rating: item.is_adult ? ContentRating.MATURE : ContentRating.EVERYONE,
    statistics: toStatistics(item),
  };
}

export function parseListResponse(data: NovelBuddySearchResponse): PagedItemList {
  const items = (data.items ?? []).map(toItem);
  return {
    items,
    total: data.pagination?.total,
    isLastPage: data.pagination?.has_next === false || items.length < PAGE_LIMIT,
  };
}

function toStatistics(item: NovelBuddyTitleItem): Statistics | undefined {
  const rating = typeof item.rating === "number" && item.rating > 0 ? item.rating : undefined;
  const views = item.stats?.views || undefined;
  const bookmarks = item.stats?.bookmarks_count || undefined;
  return rating || views || bookmarks ? { rating, views, bookmarks } : undefined;
}

// =============================== Content ================================

export function toContent(title: NovelBuddyTitle): Content {
  const webUrl = novelUrl(title.slug);
  const genres: Tag[] = (title.genres ?? []).map((g) => ({ id: g.slug, title: g.name }));
  const tags: Tag[] = (title.tags ?? []).map((t) => ({ id: t.slug, title: t.name }));
  const credits: Credit[] = [
    ...(title.authors ?? []).map((a) => ({ name: a.name, role: "Author" })),
    ...(title.artists ?? []).map((a) => ({ name: a.name, role: "Artist" })),
  ].filter((c) => c.name);

  const details: Record<string, string> = {};
  if (title.type?.name) details["Origin"] = title.type.name;
  if (title.stats?.chapters_count) details["Chapters"] = String(title.stats.chapters_count);
  if (title.release_date) details["Released"] = title.release_date;

  return {
    title: decodeEntities(title.name),
    coverImage: title.cover || "",
    webUrl,
    rating: parseContentRating(title, genres),
    status: parseStatus(title.status),
    contentType: ContentType.NOVEL,
    summary: title.summary ? htmlToText(title.summary) || undefined : undefined,
    additionalTitles: nonEmpty(
      (title.alt_names ?? []).map((a) => a.name).filter((n) => n && n !== title.name)
    ),
    credits: nonEmpty(credits),
    genres: nonEmpty(genres),
    properties: tags.length > 0 ? [{ id: "tags", title: "Tags", tags }] : undefined,
    additionalDetails: Object.keys(details).length > 0 ? details : undefined,
    statistics: toStatistics(title),
    links: [{ title: "Website", url: webUrl }],
  };
}

function parseContentRating(title: NovelBuddyTitle, genres: Tag[]): ContentRating {
  const ids = genres.map((g) => g.id);
  if (title.is_adult || ids.some((id) => MATURE_GENRES.includes(id))) return ContentRating.MATURE;
  if (ids.some((id) => SUGGESTIVE_GENRES.includes(id))) return ContentRating.SUGGESTIVE;
  return ContentRating.EVERYONE;
}

function parseStatus(status?: string): ContentStatus {
  switch (status?.toLowerCase()) {
    case "ongoing":
      return ContentStatus.ONGOING;
    case "completed":
      return ContentStatus.COMPLETED;
    case "hiatus":
      return ContentStatus.HIATUS;
    case "cancelled":
    case "canceled":
      return ContentStatus.CANCELLED;
    default:
      return ContentStatus.UNKNOWN;
  }
}

/** Names from the API can carry HTML entities, e.g. "Don&#039;t". */
function decodeEntities(text: string): string {
  return text.includes("&") ? load(text, null, false).text() : text;
}

function htmlToText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n");
  return load(withBreaks)
    .text()
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// =============================== Chapters ===============================

/** Converts the API chapter list (newest first) into Suwatte chapters. */
export function toChapters(rawChapters: NovelBuddyChapter[], slug: string): Chapter[] {
  return rawChapters.map((ch, index) => {
    const number =
      typeof ch.number === "number" ? ch.number : parseChapterNumber(ch.name);
    return {
      id: ch.slug,
      index,
      number: number ?? rawChapters.length - index,
      title: ch.name ? decodeEntities(ch.name) : undefined,
      language: "en",
      date: parseDate(ch.updated_at),
      webUrl: `${novelUrl(slug)}/${ch.slug}`,
    };
  });
}

// ============================== Chapter Text ==============================

/** Returns the chapter body as clean paragraph HTML, or null if it has no text. */
export function toChapterHtml(content: string): string | null {
  const $ = load(content, null, false);
  $("script, style, iframe, ins, noscript").remove();

  const blocks = $.root()
    .children()
    .toArray()
    .filter((el) => TEXT_TAGS.has(el.tagName.toLowerCase()) && $(el).text().trim().length > 0)
    .map((el) => {
      const $el = $(el);
      for (const name of Object.keys(el.attribs)) $el.removeAttr(name);
      return $.html($el);
    });
  if (blocks.length > 0) return blocks.join("\n");

  // Some chapters are bare text separated by line breaks; wrap each line in a paragraph.
  const lines = content
    .split(/<br\s*\/?>|\n/i)
    .map((line) => load(line).text().trim())
    .filter((line) => line.length > 0);
  return lines.length > 0
    ? lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n")
    : null;
}
