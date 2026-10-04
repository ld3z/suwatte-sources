import { CDN_URL } from "./constants";
import { AtsumaruBrowseItem, AtsumaruMangaPage } from "./types";

export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>
): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
    .join("&");
}

/** Formats values as a Typesense list body, e.g. ["a", "b"] -> "`a`,`b`". */
export function backtickList(values: Iterable<string>): string {
  return [...values].map((value) => `\`${value}\``).join(",");
}

/** Parses a free-text filter value as an integer, or returns null if it isn't one. */
export function parseInteger(value: unknown): number | null {
  if (!value || typeof value !== "string") return null;
  const parsed = parseInt(value.trim(), 10);
  return isNaN(parsed) ? null : parsed;
}

/** Returns the included ids of a select filter/setting value. */
export function selectedIds(value: unknown): string[] {
  return (value as { include?: string[] } | undefined)?.include ?? [];
}

export function nonEmpty<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

export function formatImageUrl(imagePath?: any): string {
  if (!imagePath) return "";
  let url =
    typeof imagePath === "string"
      ? imagePath
      : imagePath.url || imagePath.image || "";
  if (!url || typeof url !== "string") return "";

  if (url.startsWith("//")) {
    url = `https:${url}`;
  } else if (!url.startsWith("http")) {
    const cleanPath = url.replace(/^\/?(static\/)?/, "");
    url = `${CDN_URL}/static/${cleanPath}`;
  }
  return url.replace(/^https?:\/\/atsu\.moe\//, `${CDN_URL}/`);
}

/** Picks the best available cover image, preferring larger sizes. */
export function extractCover(
  item: AtsumaruBrowseItem | AtsumaruMangaPage
): string {
  const anyItem = item as any;
  const poster = anyItem.poster;
  const image = anyItem.image;

  const candidates = [
    anyItem.largeImage,
    anyItem.mediumImage,
    anyItem.smallImage,
    poster,
    poster?.largeImage,
    poster?.mediumImage,
    poster?.smallImage,
    poster?.image,
    poster?.url,
    image,
    image?.url,
  ];

  const cover = candidates.find((c): c is string => typeof c === "string");
  return cover !== undefined ? formatImageUrl(cover) : "";
}

export function matchesHiddenKeyword(
  item: AtsumaruBrowseItem,
  keywords: string[]
): boolean {
  if (keywords.length === 0) return false;
  const titles = [item.title, item.englishTitle]
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.toLowerCase());
  return keywords.some((k) => titles.some((t) => t.includes(k)));
}
