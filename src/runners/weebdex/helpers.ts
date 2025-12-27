import { NetworkRequest } from "@suwatte/daisuke";
import { BASE_URL, COVER_BASE_URL, REQUIRED_HEADERS } from "./constants";

export interface SimpleNetworkClient {
  request(request: NetworkRequest): Promise<NetworkResponse>;
  get(url: string, config?: NetworkRequestConfig): Promise<NetworkResponse>;
}

export interface NetworkResponse {
  data: ArrayBuffer | string;
  headers: Record<string, string>;
  status: number;
}

export interface NetworkRequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, any>;
}

/**
 * Fetch JSON data from WeebDex API
 */
export async function fetchJSON<T = any>(
  url: string,
  client: SimpleNetworkClient,
  params?: Record<string, any>
): Promise<T> {
  try {
    const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;

    // Build query string manually without using URL API
    let finalUrl = fullUrl;
    if (params && Object.keys(params).length > 0) {
      const queryParts: string[] = [];
      Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((v) => {
            if (v !== undefined && v !== null) {
              queryParts.push(
                `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`
              );
            }
          });
        } else if (value !== undefined && value !== null) {
          queryParts.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
          );
        }
      });

      if (queryParts.length > 0) {
        finalUrl = `${fullUrl}?${queryParts.join("&")}`;
      }
    }

    const response = await client.get(finalUrl, {
      headers: {
        ...REQUIRED_HEADERS,
        "Content-Type": "application/json",
      },
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: Failed to fetch ${fullUrl}`);
    }

    const text =
      typeof response.data === "string"
        ? response.data
        : new TextDecoder().decode(response.data as ArrayBuffer);

    const parsed = JSON.parse(text) as T;
    return parsed;
  } catch (error) {
    console.error(
      `fetchJSON error for ${url}:`,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

/**
 * Fetch text data
 */
export async function fetchText(
  url: string,
  client: SimpleNetworkClient,
  params?: Record<string, any>
): Promise<string> {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;

  const response = await client.get(fullUrl, {
    headers: REQUIRED_HEADERS,
    params,
  });

  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}: Failed to fetch ${fullUrl}`);
  }

  return typeof response.data === "string"
    ? response.data
    : new TextDecoder().decode(response.data as ArrayBuffer);
}

/**
 * Build manga content ID
 */
export function buildMangaId(id: string): string {
  return `weebdex:${id}`;
}

/**
 * Parse manga content ID
 */
export function parseMangaId(contentId: string): { id: string } {
  const parts = contentId.split(":");
  if (parts.length !== 2 || parts[0] !== "weebdex") {
    throw new Error(`Invalid manga ID: ${contentId}`);
  }
  return { id: parts[1] };
}

/**
 * Build chapter ID
 */
export function buildChapterId(
  mangaId: string,
  chapterId: string,
  language?: string
): string {
  const lang = language || "en";
  return `weebdex:${mangaId}:${chapterId}:${lang}`;
}

/**
 * Parse chapter ID
 */
export function parseChapterId(chapterId: string): {
  mangaId: string;
  chapterId: string;
  language: string;
} {
  const parts = chapterId.split(":");
  if (parts.length < 3 || parts[0] !== "weebdex") {
    throw new Error(`Invalid chapter ID: ${chapterId}`);
  }
  return {
    mangaId: parts[1],
    chapterId: parts[2],
    language: parts[3] || "en",
  };
}

/**
 * Get cover image URL
 */
export function getCoverUrl(
  mangaId: string,
  coverId: string,
  ext: string = "jpg",
  size?: "256" | "512"
): string {
  const extension = size ? `${size}.webp` : ext;
  return `${COVER_BASE_URL}/covers/${mangaId}/${coverId}.${extension}`;
}

/**
 * Get chapter page image URL
 */
export function getPageUrl(
  node: string,
  chapterId: string,
  filename: string,
  optimized: boolean = false
): string {
  const basePath = optimized ? "data-saver" : "data";
  // Check if node already includes protocol
  if (node.startsWith("http://") || node.startsWith("https://")) {
    return `${node}/${basePath}/${chapterId}/${filename}`;
  }
  return `https://${node}/${basePath}/${chapterId}/${filename}`;
}

/**
 * Proxify image URL to avoid CORS issues
 */
export function proxifyImage(url: string): string {
  if (!url) return "";

  // If already proxified or is a local asset, return as-is
  if (url.startsWith("/assets/") || url.includes("suwatte.app")) {
    return url;
  }

  // Return the URL - Suwatte will handle the proxying via willRequestImage
  return url;
}

/**
 * Format publication status
 */
export function formatStatus(status?: string): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Format demographic
 */
export function formatDemographic(demographic?: string): string {
  if (!demographic || demographic === "none") return "";
  return demographic.charAt(0).toUpperCase() + demographic.slice(1);
}

/**
 * Get primary title from manga
 */
export function getPrimaryTitle(manga: {
  title: string;
  alt_titles?: { [key: string]: string[] };
}): string {
  return manga.title || "Unknown Title";
}

/**
 * Get alternative titles as a formatted string
 */
export function getAltTitles(manga: {
  alt_titles?: { [key: string]: string[] };
}): string {
  if (!manga.alt_titles) return "";

  const titles: string[] = [];
  for (const lang in manga.alt_titles) {
    const langTitles = manga.alt_titles[lang];
    if (Array.isArray(langTitles)) {
      titles.push(...langTitles);
    }
  }

  return titles.filter((t) => t).join(", ");
}

/**
 * Clean HTML tags from description
 */
export function cleanDescription(description?: string): string {
  if (!description) return "";
  return description
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Format chapter number for display
 */
export function formatChapterNumber(chapter?: string, volume?: string): string {
  if (!chapter && !volume) return "Oneshot";

  let result = "";
  if (volume) {
    result += `Vol. ${volume}`;
  }
  if (chapter) {
    if (result) result += " ";
    result += `Ch. ${chapter}`;
  }

  return result || "Chapter";
}

/**
 * Build query string from params
 */
export function buildQueryString(params: Record<string, any>): string {
  const parts: string[] = [];

  for (const key in params) {
    const value = params[key];
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          parts.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`
          );
        }
      }
    } else {
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      );
    }
  }

  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/**
 * Normalize language code
 */
export function normalizeLanguage(lang: string): string {
  const mapping: { [key: string]: string } = {
    en: "en_US",
    ja: "ja_JP",
    ko: "ko_KR",
    zh: "zh_CN",
    "zh-hk": "zh_HK",
    es: "es_ES",
    fr: "fr_FR",
    de: "de_DE",
    it: "it_IT",
    pt: "pt_PT",
    "pt-br": "pt_BR",
    ru: "ru_RU",
  };

  return mapping[lang.toLowerCase()] || lang;
}

/**
 * Generate a URL-safe slug from a title
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Sleep utility for rate limiting
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
