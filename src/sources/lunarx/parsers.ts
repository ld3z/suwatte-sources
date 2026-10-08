import {
  Chapter,
  Content,
  ContentRating,
  ContentStatus,
  ContentType,
  Credit,
  Item,
  Tag,
} from "@suwatte/toolchain";

import { BASE_URL, titleCase } from "./constants";
import {
  DbChapterItem,
  DbNovel,
  ProviderNovelItem,
  ProviderNovelResponse,
  ProviderSearchResultItem,
  VolumeItem,
} from "./types";
import { escapeHtml, nonEmpty, parseJsonArray, slugify } from "./utils";

const MATURE_GENRES = ["adult", "smut"];
const SUGGESTIVE_GENRES = ["mature", "ecchi"];

export function novelUrl(slug: string): string {
  return `${BASE_URL}/novel/${slug}`;
}

/** Extracts a novel slug from a pasted `lunarx.to/novel/{slug}` URL (chapter URLs included). */
export function parseDeepLinkSlug(query: string): string | null {
  const match = query.match(/lunarx\.to\/novel\/([^/?#]+)/i);
  const slug = match?.[1];
  return slug && !["search", "filter", "playlist", "create"].includes(slug) ? slug : null;
}

// ================================= Items ==================================

export function providerItem(novel: ProviderNovelItem): Item {
  const chapters = Number(novel.chapters);
  return {
    id: novel.slug,
    title: novel.title,
    subtitle: chapters > 0 ? `${chapters} Chapters` : undefined,
    coverImage: novel.cover_url || undefined,
    webUrl: novelUrl(novel.slug),
    rating: ContentRating.EVERYONE,
  };
}

export function searchResultItem(novel: ProviderSearchResultItem): Item {
  const chapters = novel.latest_chapter_number ?? 0;
  return {
    id: novel.slug,
    title: novel.title,
    subtitle: chapters > 0 ? `${chapters} Chapters` : undefined,
    coverImage: novel.cover_path || undefined,
    webUrl: novelUrl(novel.slug),
    rating: ContentRating.EVERYONE,
  };
}

export function dbItem(novel: DbNovel): Item {
  return {
    id: novel.slug,
    title: novel.title,
    subtitle: novel.author || undefined,
    coverImage: novel.cover_url || undefined,
    webUrl: novelUrl(novel.slug),
    rating: contentLevelRating(novel.content_level),
  };
}

// ================================ Content =================================

type ProviderNovel = NonNullable<ProviderNovelResponse["novel"]>;

/** Whether `/api/novels?slug=` found the novel; misses come back as a placeholder with 0 chapters. */
export function isProviderNovel(novel?: ProviderNovel): novel is ProviderNovel {
  return !!novel && novel.title !== "Error fetching novel" && Number(novel.chapters) > 0;
}

/** Builds content details, preferring Lunar's database entry and falling back to the mirrored catalog. */
export function toContent(
  slug: string,
  db?: DbNovel,
  provider?: ProviderNovel,
  volumeCount?: number
): Content {
  const genreNames = db ? parseJsonArray(db.genres) : provider?.genres ?? [];
  const genres: Tag[] = genreNames.map((name) => ({ id: slugify(name), title: titleCase(name) }));
  const themes = parseJsonArray(db?.themes);
  const title = db?.title || provider?.title || slug;

  const credits: Credit[] = [];
  const author = db?.author || provider?.author;
  if (author) credits.push({ name: author, role: "Author" });
  if (db?.artist && db.artist !== author) credits.push({ name: db.artist, role: "Artist" });

  const altTitles = db
    ? parseJsonArray(db.alternative_titles)
    : provider?.alternative_title ? [provider.alternative_title] : [];

  const details: Record<string, string> = {};
  if (db?.publisher) details["Publisher"] = db.publisher;
  if (db?.publication_year) details["Year"] = String(db.publication_year);
  if (provider?.chapters) details["Chapters"] = provider.chapters;
  if (volumeCount && volumeCount > 0) details["Volumes"] = String(volumeCount);

  const rating = db?.content_level
    ? contentLevelRating(db.content_level)
    : genreRating(genreNames);

  return {
    title,
    coverImage: db?.cover_url || provider?.cover_url || "",
    webUrl: novelUrl(slug),
    rating,
    status: parseStatus(db?.publication_status || provider?.status),
    contentType: ContentType.NOVEL,
    summary: (db?.description || provider?.description)?.replace(/\r\n/g, "\n").trim() || undefined,
    additionalTitles: nonEmpty(altTitles.filter((t) => t !== title)),
    credits: nonEmpty(credits),
    genres: nonEmpty(genres),
    properties: themes.length > 0
      ? [{ id: "themes", title: "Themes", tags: themes.map((t) => ({ id: slugify(t), title: t })) }]
      : undefined,
    additionalDetails: Object.keys(details).length > 0 ? details : undefined,
    links: [{ title: "Website", url: novelUrl(slug) }],
  };
}

function contentLevelRating(level?: string | null): ContentRating {
  switch (level?.toLowerCase()) {
    case "explicit":
      return ContentRating.MATURE;
    case "suggestive":
      return ContentRating.SUGGESTIVE;
    default:
      return ContentRating.EVERYONE;
  }
}

function genreRating(genres: string[]): ContentRating {
  const names = genres.map((g) => g.toLowerCase());
  if (names.some((n) => MATURE_GENRES.includes(n))) return ContentRating.MATURE;
  if (names.some((n) => SUGGESTIVE_GENRES.includes(n))) return ContentRating.SUGGESTIVE;
  return ContentRating.EVERYONE;
}

function parseStatus(status?: string | null): ContentStatus {
  switch (status?.toLowerCase().trim()) {
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

// ================================ Chapters ================================

/**
 * Converts the mirrored chapter titles (oldest first) into chapters, newest
 * first. A chapter's id is its 1-based position, which is what the chapter
 * API and the website's reader URLs use; the displayed number comes from the
 * title when it has one (ORV starts at "Chapter 0").
 */
export function toChapters(slug: string, titles: string[]): Chapter[] {
  const chapters: Chapter[] = titles.map((title, i) => {
    const id = String(i + 1);
    const titled = title.match(/^\s*(?:chapter|ch\.?|ep\.?|episode|c-?)\s*(\d+(?:\.\d+)?)/i);
    return {
      id,
      index: 0,
      number: titled ? parseFloat(titled[1]) : i + 1,
      title: title.trim() || undefined,
      language: "en",
      webUrl: `${novelUrl(slug)}/${id}`,
    };
  });

  chapters.reverse();
  chapters.forEach((ch, idx) => {
    ch.index = idx;
  });
  return chapters;
}

/**
 * Converts volume entries into chapters (newest volume first).
 * Used for light novels that only have volumes and no serialized chapters.
 */
export function volumesToChapters(slug: string, volumes: VolumeItem[]): Chapter[] {
  const sorted = [...volumes].sort((a, b) => b.volume - a.volume);
  return sorted.map((vol, index) => {
    const volNum = vol.volume;
    const title = vol.title?.trim() || `Volume ${vol.volume_display || volNum}`;
    return {
      id: `vol-${volNum}`,
      index,
      number: volNum,
      volume: volNum,
      title,
      language: vol.language || "en",
      date: vol.uploaded_at ? new Date(vol.uploaded_at) : undefined,
      webUrl: `${novelUrl(slug)}/${volNum}?volume=true`,
    };
  });
}

/**
 * Converts Lunar site-uploaded database chapters into chapters (newest first).
 */
export function dbChaptersToChapters(slug: string, chapters: DbChapterItem[]): Chapter[] {
  const sorted = [...chapters].sort((a, b) => b.chapter - a.chapter);
  return sorted.map((ch, index) => {
    return {
      id: String(ch.chapter),
      index,
      number: ch.chapter,
      title: ch.chapter_title?.trim() || `Chapter ${ch.chapter}`,
      language: ch.language || "en",
      date: ch.uploaded_at ? new Date(ch.uploaded_at) : undefined,
      webUrl: `${novelUrl(slug)}/${ch.chapter}`,
    };
  });
}

// ============================== Chapter Text ==============================

/** Turns the plain-text body (blank-line separated paragraphs) into HTML. */
export function toChapterHtml(body: string): string {
  if (/<(?:p|div|br)\b/i.test(body)) {
    return body;
  }
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
