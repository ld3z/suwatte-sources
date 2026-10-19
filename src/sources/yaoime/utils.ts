import { BASE_URL } from "./constants";

export function absoluteUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${BASE_URL}${url}`;
  return url;
}

/** Builds a query string; array values become repeated keys (`genre=a&genre=b`). */
export function buildQueryString(
  params: Record<string, string | number | boolean | string[] | undefined | null>
): string {
  return Object.entries(params)
    .flatMap(([key, value]) =>
      (Array.isArray(value) ? value : [value]).map((v) => [key, v] as const)
    )
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
    .join("&");
}

/** Returns the included ids of a select filter/setting value. */
export function selectedIds(value: unknown): string[] {
  return (value as { include?: string[] } | undefined)?.include ?? [];
}

export function nonEmpty<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

/** Rewrites `/i/c/{hash}?w=` cover URLs to a larger size. */
export function sizedImage(url: string, width: number): string {
  const absolute = absoluteUrl(url);
  if (!absolute) return "";
  if (/[?&]w=\d+/.test(absolute)) {
    return absolute.replace(/([?&]w=)\d+/, `$1${width}`);
  }
  const join = absolute.includes("?") ? "&" : "?";
  return `${absolute}${join}w=${width}`;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parses dates like "13 Oct 2026" from chapter rows. */
export function parseAbsoluteDate(text: string): Date | undefined {
  const match = text.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (!match) return undefined;
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  if (month === undefined) return undefined;
  const date = new Date(Number(match[3]), month, Number(match[1]));
  return isNaN(date.getTime()) ? undefined : date;
}

const LANG_BY_NAME: Record<string, string> = {
  english: "en",
  japanese: "ja",
  korean: "ko",
  chinese: "zh",
  spanish: "es",
  french: "fr",
  portuguese: "pt",
  russian: "ru",
  italian: "it",
  german: "de",
  vietnamese: "vi",
  indonesian: "id",
  thai: "th",
  polish: "pl",
  turkish: "tr",
};

export function languageCode(name?: string): string {
  if (!name) return "en";
  const trimmed = name.trim();
  if (/^[a-z]{2}(?:-[a-z0-9]+)?$/i.test(trimmed)) return trimmed.toLowerCase();
  return LANG_BY_NAME[trimmed.toLowerCase()] ?? "en";
}
