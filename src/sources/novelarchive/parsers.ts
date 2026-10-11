import {
  Chapter,
  Content,
  ContentRating,
  ContentStatus,
  ContentType,
  Item,
  PagedItemList,
  Statistics,
  Tag,
} from "@suwatte/toolchain";

import { BASE_URL } from "./constants";
import { NovelArchiveListResponse, NovelArchiveNovel } from "./types";
import { absoluteUrl, escapeHtml, nonEmpty, resolveChapterNumbers } from "./utils";

const MATURE_GENRES = ["adult", "smut"];
const SUGGESTIVE_GENRES = ["mature", "ecchi"];

export function novelUrl(id: string): string {
  return `${BASE_URL}/novel?id=${id}`;
}

export function chapterUrl(id: string, number: string): string {
  return `${BASE_URL}/reader?novel=${id}&chapter=${number}`;
}

/** Extracts a novel id from a pasted `novel?id=` or `reader?novel=` URL. */
export function parseDeepLinkId(query: string): string | null {
  const match = query.match(/novelarchive\.cc\/(?:novel\?(?:.*&)?id=|reader\?(?:.*&)?novel=)([a-f0-9]{24})/i);
  return match ? match[1] : null;
}

// ================================ Items =================================

export function toItem(novel: NovelArchiveNovel): Item {
  const chapters = Number(novel.total_chapters);
  return {
    id: novel.id,
    title: novel.title,
    subtitle: chapters > 0 ? `${chapters} Chapters` : undefined,
    coverImage: absoluteUrl(novel.cover_url) || undefined,
    webUrl: novelUrl(novel.id),
    rating: parseContentRating(parseGenres(novel.genres)),
    statistics: toStatistics(novel),
  };
}

export function parseListResponse(
  data: NovelArchiveListResponse,
  paged: boolean
): PagedItemList {
  return {
    items: (data.novels ?? []).map(toItem),
    total: data.pagination?.total,
    isLastPage: !paged || !data.pagination?.has_next,
  };
}

function toStatistics(novel: NovelArchiveNovel): Statistics | undefined {
  const rating = novel.rating && novel.rating > 0 ? novel.rating : undefined;
  const views = novel.views_number || undefined;
  return rating || views ? { rating, views } : undefined;
}

// =============================== Content ================================

export function toContent(novel: NovelArchiveNovel): Content {
  const webUrl = novelUrl(novel.id);
  const genres = parseGenres(novel.genres);

  const details: Record<string, string> = {};
  if (Number(novel.total_chapters) > 0) details["Chapters"] = novel.total_chapters!;
  if (novel.rating_count) details["Ratings"] = String(novel.rating_count);

  return {
    title: novel.title,
    coverImage: absoluteUrl(novel.cover_url),
    webUrl,
    rating: parseContentRating(genres),
    status: parseStatus(novel.release_status),
    contentType: ContentType.NOVEL,
    summary: novel.description?.replace(/\r\n/g, "\n").trim() || undefined,
    additionalTitles: nonEmpty(
      (novel.associated_names ?? []).filter((n) => n && n !== novel.title)
    ),
    credits: novel.author ? [{ name: novel.author, role: "Author" }] : undefined,
    genres: nonEmpty(genres),
    additionalDetails: Object.keys(details).length > 0 ? details : undefined,
    statistics: toStatistics(novel),
    links: [{ title: "Website", url: webUrl }],
  };
}

function parseGenres(genres?: string): Tag[] {
  const seen = new Set<string>();
  return (genres ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g.length > 0)
    .map((g) => ({ id: g.toLowerCase(), title: g }))
    .filter((g) => !seen.has(g.id) && !!seen.add(g.id));
}

function parseContentRating(genres: Tag[]): ContentRating {
  const ids = genres.map((g) => g.id);
  if (ids.some((id) => MATURE_GENRES.includes(id))) return ContentRating.MATURE;
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
    default:
      return ContentStatus.UNKNOWN;
  }
}

// =============================== Chapters ===============================

/**
 * Builds the chapter list, newest first. Chapters are addressed by their
 * 1-based position, and the novel only carries their names; novels missing
 * names fall back to "Chapter N" for each position.
 */
export function toChapters(novel: NovelArchiveNovel): Chapter[] {
  const names = novel.chapter_names ?? [];
  const total = Math.max(names.length, Number(novel.total_chapters) || 0);
  const titles = Array.from({ length: total }, (_, i) => names[i]?.trim() || `Chapter ${i + 1}`);
  const numbers = resolveChapterNumbers(
    titles.map((title, i) => ({ title, position: i + 1 }))
  );

  const chapters: Chapter[] = titles.map((title, i) => ({
    id: String(i + 1),
    index: 0,
    number: numbers[i],
    title,
    language: "en",
    webUrl: chapterUrl(novel.id, String(i + 1)),
  }));

  chapters.reverse();
  chapters.forEach((ch, idx) => {
    ch.index = idx;
  });
  return chapters;
}

// ============================== Chapter Text ==============================

/** Turns the plain-text body (one paragraph per line) into HTML. */
export function toChapterHtml(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n");
}
