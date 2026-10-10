import {
  Chapter,
  ChapterPage,
  ChapterUnavailableError,
  Content,
  ContentRating,
  ContentStatus,
  ContentType,
  Item,
  ReadingMode,
} from "@suwatte/toolchain";
import { load } from "cheerio/slim";

import { BASE_URL, MATURE_GENRES, SUGGESTIVE_GENRES } from "./constants";
import { absoluteUrl, nonEmpty, titleFromPath, toPath } from "./utils";

export const RECENT_SELECTOR =
  "table.mobile-files-table tbody tr td:nth-child(1) a:not([rel='nofollow'])";
export const SEARCH_SELECTOR =
  "div.container table tbody tr td:nth-child(1) a:nth-child(1)";

const CHAPTER_SELECTOR = "table#index-table > tbody > tr > td:last-child > a";
const COVER_SELECTOR = "div.manga-info img[itemprop='image']";
const FILE_EXTENSION = /\.(cbz|cbr|zip|rar|7z|pdf)$/i;

// ================================ Items =================================

/** Parses linked series, without covers; the site lists the same series once per file. */
export function parseItems(html: string, selector: string): Item[] {
  const $ = load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $(selector).each((_, el) => {
    const id = toPath($(el).attr("href") ?? "");
    const title = titleFromPath(id);
    if (!id || !title || seen.has(id)) return;
    seen.add(id);
    items.push({
      id,
      title,
      webUrl: `${BASE_URL}${id}`,
      rating: ContentRating.UNKNOWN,
    });
  });

  return items;
}

export function parseCover(html: string): string | undefined {
  const cover = load(html)(COVER_SELECTOR).attr("src");
  return cover ? absoluteUrl(cover) : undefined;
}

// =============================== Content ================================

export function parseContent(html: string, contentId: string): Content {
  const $ = load(html);

  const authors = $("p.staff a[itemprop='author']")
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);
  const genres = $("div.genres a[itemprop='genre']")
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);
  const cover = $("img[itemprop='image']").attr("src");

  return {
    title: $("span.title[itemprop='name']").text().trim() || titleFromPath(contentId),
    coverImage: cover ? absoluteUrl(cover) : "",
    webUrl: `${BASE_URL}${contentId}`,
    rating: ratingForGenres(genres),
    status:
      $("span.scanstatus").text().trim() === "Yes"
        ? ContentStatus.COMPLETED
        : ContentStatus.ONGOING,
    contentType: ContentType.MANGA,
    readingMode: ReadingMode.PAGED_MANGA,
    credits: nonEmpty(authors.map((name) => ({ name, role: "Author" }))),
    genres: nonEmpty(genres.map((g) => ({ id: g.toLowerCase(), title: g }))),
  };
}

function ratingForGenres(genres: string[]): ContentRating {
  const lower = genres.map((g) => g.toLowerCase());
  if (lower.some((g) => MATURE_GENRES.includes(g))) return ContentRating.MATURE;
  if (lower.some((g) => SUGGESTIVE_GENRES.includes(g))) return ContentRating.SUGGESTIVE;
  return ContentRating.EVERYONE;
}

// =============================== Chapters ===============================

/** Each file in the series folder is one chapter, newest first. */
export function parseChapters(html: string): Chapter[] {
  const $ = load(html);
  const seriesTitle = $("span.title[itemprop='name']").text().trim();

  const chapters = $(CHAPTER_SELECTOR)
    .toArray()
    .flatMap((el): Chapter[] => {
      const row = $(el).parent().parent();
      const id = toPath($(el).attr("href") ?? "");
      if (!id.startsWith("/reader/")) return [];

      const fileName = row.find("td:first-child a").text().trim();
      const title = fileName.replace(FILE_EXTENSION, "") || undefined;
      const { number, volume } = parseChapterNumbers(fileName, seriesTitle);

      return [
        {
          id,
          index: 0,
          number,
          volume,
          title,
          language: "en",
          date: parseDate(row.find("td:nth-child(3)").text().trim()),
          webUrl: `${BASE_URL}${id}`,
        },
      ];
    })
    .reverse();

  chapters.forEach((ch, idx) => {
    ch.index = idx;
  });
  return chapters;
}

/**
 * Reads `v01`/`vol 1` and `c001`/`ch. 1` markers from a file name. A chapter
 * range like `c001-008` counts as its last chapter; volume-only files are
 * numbered by volume.
 */
export function parseChapterNumbers(
  fileName: string,
  seriesTitle: string
): { number: number; volume?: number } {
  let name = fileName.replace(FILE_EXTENSION, "");
  if (seriesTitle) {
    name = name.split(seriesTitle).join(" ");
  }
  name = name.replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, " ");

  const volumeMatch = name.match(/(?:^|[\s_])v(?:ol(?:ume)?)?\.?\s*(\d+(?:\.\d+)?)/i);
  const volume = volumeMatch ? Number(volumeMatch[1]) : undefined;

  const chapterMatch = name.match(
    /(?:^|[\s_])c(?:h(?:apter)?)?\.?\s*(\d+(?:\.\d+)?)(?:\s*-\s*c?(\d+(?:\.\d+)?))?/i
  );
  if (chapterMatch) {
    return { number: Number(chapterMatch[2] ?? chapterMatch[1]), volume };
  }

  if (volume !== undefined) {
    return { number: volume, volume };
  }

  const bare = name.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/);
  return { number: bare ? Number(bare[1]) : -1, volume };
}

/** Dates are `YYYY-MM-DD HH:mm` in local time, or relative (`5 minutes ago`) for recent files. */
export function parseDate(text: string): Date | undefined {
  if (text.endsWith("ago")) {
    const [amountText, unit = ""] = text.split(/\s+/);
    const amount = parseInt(amountText, 10);
    if (isNaN(amount)) return undefined;

    const date = new Date();
    if (unit.startsWith("sec")) date.setSeconds(date.getSeconds() - amount);
    else if (unit.startsWith("min")) date.setMinutes(date.getMinutes() - amount);
    else if (unit.startsWith("hour")) date.setHours(date.getHours() - amount);
    else if (unit.startsWith("day")) date.setDate(date.getDate() - amount);
    return date;
  }

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return undefined;
  const [, year, month, day, hour = "0", minute = "0"] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}

// ================================ Pages =================================

export function parsePages(html: string): ChapterPage[] {
  const reader = load(html)("div#reader");
  const path = reader.attr("data-path");
  const filesJson = reader.attr("data-files");
  if (!path || !filesJson) {
    throw new ChapterUnavailableError("Invalid chapter data");
  }

  const files: unknown[] = JSON.parse(filesJson);
  return files
    .map((file) => (typeof file === "string" ? file : ""))
    .filter(Boolean)
    .map((file) => ({
      url: `${BASE_URL}/reader/image?path=${encodeURIComponent(path)}&file=${encodeURIComponent(file)}`,
    }));
}
