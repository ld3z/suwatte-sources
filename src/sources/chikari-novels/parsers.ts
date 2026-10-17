import {
  Chapter,
  Content,
  ContentRating,
  ContentStatus,
  ContentType,
  Credit,
  Item,
  Tag,
  TagSection,
} from "@suwatte/toolchain";

import { BASE_URL } from "./constants";
import { ChikariChapter, ChikariNovel, ChikariNovelItem } from "./types";
import { escapeHtml, nonEmpty, resolveChapterNumbers } from "./utils";

const MATURE_GENRES = ["mature", "smut", "adult"];
const SUGGESTIVE_GENRES = ["ecchi"];

export function novelUrl(slug: string): string {
  return `${BASE_URL}/novels/${slug}`;
}

/** Extracts a novel slug from a pasted `chikari.moe/novels/{slug}` URL. */
export function parseDeepLinkSlug(query: string): string | null {
  const match = query.match(/chikari\.moe\/novels\/([a-z0-9_-]+)/i);
  return match ? match[1] : null;
}

// ================================ Items =================================

export function toItem(item: ChikariNovelItem): Item {
  return {
    id: item.slug,
    title: item.title,
    subtitle:
      typeof item.chapter_count === "number"
        ? `${item.chapter_count} Chapters`
        : undefined,
    coverImage: item.cover_url || undefined,
    webUrl: novelUrl(item.slug),
    rating: item.is_nsfw ? ContentRating.MATURE : ContentRating.EVERYONE,
    statistics: toStatistics(item.rating, item.views),
  };
}

function toStatistics(rawRating: unknown, rawViews: unknown) {
  const rating =
    typeof rawRating === "number" && rawRating > 0
      ? Number(rawRating.toFixed(2))
      : undefined;
  const views = typeof rawViews === "number" ? rawViews : undefined;
  return rating || views ? { rating, views } : undefined;
}

// =============================== Content ================================

export function toContent(novel: ChikariNovel): Content {
  const webUrl = novelUrl(novel.slug);
  const genres: Tag[] = (novel.genres ?? []).map((g) => ({ id: g.slug, title: g.name }));

  return {
    title: novel.title,
    coverImage: novel.cover_url || "",
    webUrl,
    rating: parseContentRating(novel, genres),
    status: parseStatus(novel.status),
    contentType: ContentType.NOVEL,
    summary: novel.description?.replace(/\r\n/g, "\n").trim() || undefined,
    additionalTitles: nonEmpty(
      (novel.alt_titles ?? []).filter((t) => t && t !== novel.title)
    ),
    credits: nonEmpty(parseCredits(novel)),
    genres: nonEmpty(genres),
    properties: nonEmpty(parseTagSections(novel)),
    links: [{ title: "Website", url: webUrl }],
    statistics: toStatistics(novel.rating, novel.views),
  };
}

function parseContentRating(novel: ChikariNovel, genres: Tag[]): ContentRating {
  const ids = genres.map((g) => g.id);
  if (novel.is_nsfw || ids.some((id) => MATURE_GENRES.includes(id))) {
    return ContentRating.MATURE;
  }
  if (ids.some((id) => SUGGESTIVE_GENRES.includes(id))) {
    return ContentRating.SUGGESTIVE;
  }
  return ContentRating.EVERYONE;
}

function parseStatus(status?: string): ContentStatus {
  switch (status?.toLowerCase()?.trim()) {
    case "releasing":
    case "ongoing":
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

function parseCredits(novel: ChikariNovel): Credit[] {
  return (novel.authors ?? [])
    .filter((a) => a?.name)
    .map((a) => ({
      name: a.name,
      role: a.role ? a.role.charAt(0).toUpperCase() + a.role.slice(1) : "Author",
    }));
}

function parseTagSections(novel: ChikariNovel): TagSection[] {
  const tags = (novel.tags ?? []).filter((t) => !t.is_spoiler);
  if (tags.length === 0) return [];
  return [
    {
      id: "tags",
      title: "Tags",
      tags: tags.map((t) => ({ id: String(t.id), title: t.name })),
    },
  ];
}

// =============================== Chapters ===============================

/**
 * Converts raw chapters into Suwatte chapters, newest first. The API `number`
 * is the site's sequential position (used in chapter URLs and for ordering);
 * the real chapter number is read from the title.
 */
export function toChapters(rawChapters: ChikariChapter[], slug: string): Chapter[] {
  const sorted = rawChapters
    .filter((ch) => typeof ch.number === "number")
    .sort((a, b) => a.number - b.number);
  const numbers = resolveChapterNumbers(
    sorted.map((ch) => ({ title: ch.title, position: ch.number }))
  );

  const chapters: Chapter[] = sorted.map((ch, idx) => {
    return {
      id: String(ch.number),
      number: numbers[idx],
      volume: parseVolume(ch.volume),
      title: ch.title || undefined,
      index: 0,
      language: ch.lang || "en",
      date: parseDate(ch.created_at),
      webUrl: `${novelUrl(slug)}/${ch.number}`,
    };
  });

  chapters.reverse();
  chapters.forEach((ch, idx) => {
    ch.index = idx;
  });
  return chapters;
}

function parseVolume(volume?: string): number | undefined {
  const parsed = volume ? parseFloat(volume) : NaN;
  return isNaN(parsed) ? undefined : parsed;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

// ============================== Chapter Text ==============================

/** Turns the plain-text body (blank-line separated paragraphs) into HTML. */
export function toChapterHtml(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
