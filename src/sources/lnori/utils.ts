import { ContentRating } from "@suwatte/toolchain";

import { BASE_URL, SUGGESTIVE_TAGS } from "./constants";

export function absoluteUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${BASE_URL}${url}`;
  return url;
}

/** Content ids are `{seriesId}/{slug}`; the site 404s without the slug. */
export function seriesUrl(contentId: string): string {
  return `${BASE_URL}/series/${contentId}`;
}

/** Chapter ids are `{bookId}/{slug}`, one per volume. */
export function bookUrl(chapterId: string): string {
  return `${BASE_URL}/book/${chapterId}`;
}

export function ratingForTags(tags: string[]): ContentRating {
  return tags.some((t) => SUGGESTIVE_TAGS.includes(t.toLowerCase()))
    ? ContentRating.SUGGESTIVE
    : ContentRating.EVERYONE;
}

export function nonEmpty<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|[\s\-/])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
