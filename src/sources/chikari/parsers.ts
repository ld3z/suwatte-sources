import {
  Chapter,
  Content,
  ContentRating,
  ContentStatus,
  ContentType,
  Credit,
  Item,
  ReadingMode,
  Tag,
  TagSection,
  WebLink,
} from "@suwatte/toolchain";

import { BASE_URL, TYPE_OPTIONS } from "./constants";
import { ChikariChapter, ChikariSeries, ChikariSeriesItem } from "./types";
import { nonEmpty } from "./utils";

const MATURE_GENRES = ["adult", "erotica", "smut", "mature", "lolicon", "shotacon"];
const SUGGESTIVE_GENRES = ["ecchi"];

export function seriesUrl(slug: string): string {
  return `${BASE_URL}/series/${slug}`;
}

/** Extracts a series slug from a pasted `chikari.moe/series/{slug}` URL. */
export function parseDeepLinkSlug(query: string): string | null {
  const match = query.match(/chikari\.moe\/series\/([a-z0-9_-]+)/i);
  return match ? match[1] : null;
}

// ================================ Items =================================

export function toItem(item: ChikariSeriesItem): Item {
  const subtitle = [
    typeLabel(item.type),
    typeof item.chapter_count === "number" ? `${item.chapter_count} Chapters` : undefined,
  ]
    .filter(Boolean)
    .join(" • ");

  return {
    id: item.slug,
    title: item.title,
    subtitle: subtitle || undefined,
    coverImage: item.cover_url || undefined,
    webUrl: seriesUrl(item.slug),
    rating: item.is_nsfw ? ContentRating.MATURE : ContentRating.EVERYONE,
    statistics: toStatistics(item.rating, item.views),
  };
}

function typeLabel(type?: string): string | undefined {
  return TYPE_OPTIONS.find((o) => o.id === type)?.title;
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

export function toContent(series: ChikariSeries): Content {
  const webUrl = seriesUrl(series.slug);
  const genres: Tag[] = (series.genres ?? []).map((g) => ({ id: g.slug, title: g.name }));
  const contentType = parseContentType(series.type);
  const trackerIds = parseTrackerIds(series);

  return {
    title: series.title,
    coverImage: series.cover_url || "",
    bannerImage: series.banner_url || undefined,
    webUrl,
    rating: parseContentRating(series, genres),
    status: parseStatus(series.status),
    contentType,
    readingMode: parseReadingMode(series.reading_mode, contentType),
    summary: series.description?.replace(/\r\n/g, "\n").trim() || undefined,
    additionalTitles: nonEmpty(
      (series.alt_titles ?? []).filter((t) => t && t !== series.title)
    ),
    credits: nonEmpty(parseCredits(series)),
    genres: nonEmpty(genres),
    properties: nonEmpty(parseTagSections(series)),
    endpoints: Object.keys(trackerIds).length > 0 ? trackerIds : undefined,
    links: parseLinks(series, webUrl),
    statistics: toStatistics(series.rating, series.views),
  };
}

function parseContentRating(series: ChikariSeries, genres: Tag[]): ContentRating {
  const ids = genres.map((g) => g.id);
  if (series.is_nsfw || ids.some((id) => MATURE_GENRES.includes(id))) {
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

function parseContentType(type?: string): ContentType {
  switch (type?.toLowerCase()?.trim()) {
    case "manhwa":
      return ContentType.MANHWA;
    case "manhua":
      return ContentType.MANHUA;
    case "oel":
      return ContentType.COMIC;
    default:
      return ContentType.MANGA;
  }
}

/** The site flags long-strip titles; other titles read paged in their type's direction. */
function parseReadingMode(mode: string | undefined, contentType: ContentType): ReadingMode {
  if (mode === "strip") return ReadingMode.VERTICAL;
  switch (contentType) {
    case ContentType.MANGA:
      return ReadingMode.PAGED_MANGA;
    case ContentType.COMIC:
      return ReadingMode.PAGED_COMIC;
    default:
      return ReadingMode.VERTICAL;
  }
}

/** Authors listed under several roles are merged into one credit. */
function parseCredits(series: ChikariSeries): Credit[] {
  const roles = new Map<string, string[]>();
  for (const author of series.authors ?? []) {
    if (!author?.name) continue;
    const role = author.role
      ? author.role.charAt(0).toUpperCase() + author.role.slice(1)
      : "Author";
    const existing = roles.get(author.name) ?? [];
    if (!existing.includes(role)) existing.push(role);
    roles.set(author.name, existing);
  }
  return [...roles].map(([name, r]) => ({ name, role: r.join(", ") }));
}

function parseTagSections(series: ChikariSeries): TagSection[] {
  const tags = (series.tags ?? []).filter((t) => !t.is_spoiler);
  if (tags.length === 0) return [];
  return [
    {
      id: "tags",
      title: "Tags",
      tags: tags.map((t) => ({ id: String(t.id), title: t.name })),
    },
  ];
}

/** Cross-source tracker ids, keyed by Suwatte tracker name. */
function parseTrackerIds(series: ChikariSeries): Record<string, string> {
  const sources: [string, string | number | null | undefined][] = [
    ["anilist", series.anilist_id],
    ["mal", series.mal_id],
    ["kitsu", series.kitsu_id],
    ["mangaupdates", series.mangaupdates_id],
  ];

  const ids: Record<string, string> = {};
  for (const [tracker, id] of sources) {
    if (id) ids[tracker] = String(id);
  }
  return ids;
}

function parseLinks(series: ChikariSeries, webUrl: string): WebLink[] {
  const links: WebLink[] = [{ title: "Website", url: webUrl }];
  if (series.anilist_id) {
    links.push({ title: "AniList", url: `https://anilist.co/manga/${series.anilist_id}` });
  }
  if (series.mal_id) {
    links.push({ title: "MyAnimeList", url: `https://myanimelist.net/manga/${series.mal_id}` });
  }
  return links;
}

// =============================== Chapters ===============================

/** Chapter ids are `{number}` for the site's own uploads and `{number}/{scan}` per scan group. */
export function toChapterId(number: number, scan?: string): string {
  return scan ? `${number}/${scan}` : String(number);
}

export function parseChapterId(chapterId: string): { number: string; scan?: string } {
  const [number, scan] = chapterId.split("/");
  return { number, scan: scan || undefined };
}

/** Converts raw chapters into Suwatte chapters, newest first, one per scan group. */
export function toChapters(rawChapters: ChikariChapter[], slug: string): Chapter[] {
  const sorted = rawChapters
    .filter((ch) => typeof ch.number === "number")
    .sort((a, b) => b.number - a.number);

  const chapters: Chapter[] = sorted.flatMap((ch) => {
    const base = {
      number: ch.number,
      volume: parseVolume(ch.volume),
      title: ch.title || undefined,
      index: 0,
      language: ch.lang || "en",
    };
    const webUrl = `${seriesUrl(slug)}/${ch.number}`;

    if (!ch.scans || ch.scans.length === 0) {
      return [{ ...base, id: toChapterId(ch.number), date: parseDate(ch.created_at), webUrl }];
    }
    return ch.scans.map((scan) => ({
      ...base,
      id: toChapterId(ch.number, scan.slug),
      date: parseDate(scan.created_at ?? ch.created_at),
      webUrl: `${webUrl}?scan=${encodeURIComponent(scan.slug)}`,
      providers: [{ id: scan.slug, name: scan.name, links: [] }],
    }));
  });

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
