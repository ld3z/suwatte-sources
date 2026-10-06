import {
  Chapter,
  Content,
  ContentRating,
  ContentStatus,
  ContentType,
  Credit,
  Item,
  ItemCollection,
  Tag,
  TagSection,
  WebLink,
} from "@suwatte/toolchain";

import { BASE_URL } from "./constants";
import {
  AtsumaruBrowseItem,
  AtsumaruChapterItem,
  AtsumaruMangaPage,
} from "./types";
import {
  extractCover,
  formatImageUrl,
  nonEmpty,
  resolveChapterNumbers,
} from "./utils";

const MATURE_GENRES = ["Adult", "Hentai", "Smut"];
const SUGGESTIVE_GENRES = ["Ecchi"];
const SUGGESTIVE_MB_RATINGS = ["Suggestive", "Erotica"];

// ================================ Items =================================

export function toItem(item: AtsumaruBrowseItem): Item {
  return {
    id: item.id,
    title: item.title,
    subtitle: "Novel",
    coverImage: extractCover(item),
    webUrl: `${BASE_URL}/novel/${item.id}`,
    rating: item.isAdult ? ContentRating.MATURE : ContentRating.EVERYONE,
    statistics: toStatistics(item.mbRating, item.views),
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

export function toContent(page: AtsumaruMangaPage, contentId: string): Content {
  const webUrl = `${BASE_URL}/novel/${contentId}`;
  const trackerIds = parseTrackerIds(page);

  return {
    title: page.title,
    coverImage: extractCover(page),
    bannerImage: page.banner ? formatImageUrl(page.banner) : undefined,
    webUrl,
    rating: parseContentRating(page),
    status: parseStatus(page.status),
    contentType: ContentType.NOVEL,
    summary: page.synopsis || undefined,
    additionalTitles: parseAdditionalTitles(page),
    credits: nonEmpty(parseCredits(page)),
    genres: nonEmpty(parseGenres(page)),
    properties: nonEmpty(parseTagSections(page)),
    collections: nonEmpty(parseCollections(page)),
    endpoints: Object.keys(trackerIds).length > 0 ? trackerIds : undefined,
    links: parseLinks(page, webUrl),
    statistics: toStatistics(page.avgRating, page.views),
  };
}

function parseContentRating(page: AtsumaruMangaPage): ContentRating {
  const genreNames = (page.genres ?? []).map((g) => g.name);

  if (page.isAdult || genreNames.some((n) => MATURE_GENRES.includes(n))) {
    return ContentRating.MATURE;
  }
  if (
    genreNames.some((n) => SUGGESTIVE_GENRES.includes(n)) ||
    SUGGESTIVE_MB_RATINGS.includes(page.mbContentRating as string)
  ) {
    return ContentRating.SUGGESTIVE;
  }
  return ContentRating.EVERYONE;
}

function parseStatus(status?: string): ContentStatus {
  switch (status?.toLowerCase()?.trim()) {
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

function parseAdditionalTitles(page: AtsumaruMangaPage): string[] {
  const titles = new Set<string>();
  if (page.englishTitle && page.englishTitle !== page.title) {
    titles.add(page.englishTitle);
  }
  for (const name of Array.isArray(page.otherNames) ? page.otherNames : []) {
    if (name && name !== page.title) {
      titles.add(name);
    }
  }
  return Array.from(titles);
}

function parseCredits(page: AtsumaruMangaPage): Credit[] {
  const credits: Credit[] = [];
  for (const author of Array.isArray(page.authors) ? page.authors : []) {
    if (typeof author === "string") {
      credits.push({ name: author, role: "Author" });
    } else if (author && author.name) {
      credits.push({ name: author.name, role: author.type || "Author" });
    }
  }
  return credits;
}

function parseGenres(page: AtsumaruMangaPage): Tag[] {
  return (page.genres || []).map((g) => ({ id: String(g.id), title: g.name }));
}

function parseTagSections(page: AtsumaruMangaPage): TagSection[] {
  if (!Array.isArray(page.tags) || page.tags.length === 0) return [];
  return [
    {
      id: "tags",
      title: "Tags",
      tags: page.tags.map((t) => ({ id: String(t.id), title: t.name })),
    },
  ];
}

function parseCollections(page: AtsumaruMangaPage): ItemCollection[] {
  if (!Array.isArray(page.recommendations) || page.recommendations.length === 0) {
    return [];
  }
  return [
    {
      id: "recommendations",
      title: "Recommendations",
      items: page.recommendations.map(toItem),
    },
  ];
}

/** Cross-source tracker ids, keyed by Suwatte tracker name. */
function parseTrackerIds(page: AtsumaruMangaPage): Record<string, string> {
  const sources: [string, string | number | undefined][] = [
    ["anilist", page.anilistId],
    ["mal", page.malId],
    ["kitsu", page.kitsuId],
    ["ann", page.annId],
    ["mangaupdates", page.mangaUpdatesId],
  ];

  const ids: Record<string, string> = {};
  for (const [tracker, id] of sources) {
    if (id) ids[tracker] = String(id);
  }
  return ids;
}

function parseLinks(page: AtsumaruMangaPage, webUrl: string): WebLink[] {
  const links: WebLink[] = [{ title: "Website", url: webUrl }];
  if (page.kenmeiUrl) {
    links.push({ title: "Kenmei", url: page.kenmeiUrl });
  }
  if (page.anilistId) {
    links.push({
      title: "AniList",
      url: `https://anilist.co/manga/${page.anilistId}`,
    });
  }
  if (page.malId) {
    links.push({
      title: "MyAnimeList",
      url: `https://myanimelist.net/manga/${page.malId}`,
    });
  }
  return links;
}

// =============================== Chapters ===============================

/**
 * Converts raw chapters into Suwatte chapters, newest first. The API `number`
 * is the chapter's position on the site (used for ordering); the displayed
 * number is read from the title.
 */
export function toChapters(
  rawChapters: AtsumaruChapterItem[],
  scanlators: Map<string, string>,
  contentId: string
): Chapter[] {
  const sorted = [...rawChapters].sort(compareOldestFirst);
  const numbers = resolveChapterNumbers(
    sorted.map((ch) => ({ title: ch.title, position: chapterPosition(ch) }))
  );

  const chapters: Chapter[] = sorted.map((ch, idx) => {
    const scanlatorName = ch.scanlationMangaId
      ? scanlators.get(ch.scanlationMangaId)
      : undefined;

    return {
      id: ch.id,
      number: numbers[idx],
      title: ch.title || undefined,
      index: idx,
      language: "en",
      date: parseTimestamp(ch.createdAt),
      webUrl: `${BASE_URL}/read/${contentId}/${ch.id}`,
      providers: scanlatorName
        ? [{ id: ch.scanlationMangaId!, name: scanlatorName, links: [] }]
        : undefined,
    };
  });

  chapters.reverse();
  chapters.forEach((ch, idx) => {
    ch.index = idx;
  });

  return chapters;
}

function chapterPosition(ch: AtsumaruChapterItem): number {
  if (typeof ch.number === "number") return ch.number;
  return typeof ch.index === "number" ? ch.index + 1 : 0;
}

/** Orders by site position ascending, then by upload date ascending. */
function compareOldestFirst(a: AtsumaruChapterItem, b: AtsumaruChapterItem): number {
  const byPosition = chapterPosition(a) - chapterPosition(b);
  if (byPosition !== 0) return byPosition;
  return (parseTimestamp(a.createdAt)?.getTime() ?? 0) - (parseTimestamp(b.createdAt)?.getTime() ?? 0);
}

function parseTimestamp(value: unknown): Date | undefined {
  if (!value) return undefined;
  const time = typeof value === "number" ? value : Number(value);
  return !isNaN(time) && time > 0 ? new Date(time) : undefined;
}
