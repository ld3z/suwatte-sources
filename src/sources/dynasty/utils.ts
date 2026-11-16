import { BASE_URL } from "./constants";

export function absoluteUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${BASE_URL}${url}`;
  return url;
}

/** Builds a query string; array values become repeated keys (`classes[]=Series&classes[]=Doujin`). */
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

/** Appends `?page=` to a listing path; page 1 keeps the bare path. */
export function withPage(path: string, page: number): string {
  return page > 1 ? `${path}${path.includes("?") ? "&" : "?"}page=${page}` : path;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parses release dates like "Nov 15 '26" (lists) and "Nov 15, 2026" (details). */
export function parseReleaseDate(text: string): Date | undefined {
  const match = text.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s+'?(\d{2,4})/);
  if (!match) return undefined;
  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return undefined;
  const rawYear = Number(match[3]);
  const year =
    match[3].length === 2 ? rawYear + (rawYear <= 69 ? 2000 : 1900) : rawYear;
  const date = new Date(year, month, Number(match[2]));
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Series slug behind a chapter permalink: `series_ch10`, `series_ch22_5`,
 * and re-upload suffixes (`series_ch03_1`) all strip back to the series.
 */
export function seriesSlugFromChapterSlug(slug: string): string | null {
  const match = /^(.+)_ch\d+(?:[._]\d+)*(?:_\d+)*$/.exec(slug);
  return match ? match[1] : null;
}

/**
 * Splits a display label like "Series ch10: The Fall" into its series title
 * and the chapter part. Standalone releases ("Pocky Day") stay unsplit.
 */
export function splitChapterLabel(label: string): {
  title: string;
  chapter?: string;
} {
  const match = /^(.*?)\s+ch\d+(?:[._]\d+)*(?::\s*([\s\S]*))?$/.exec(
    label.replace(/\s+/g, " ").trim()
  );
  if (!match) return { title: label.replace(/\s+/g, " ").trim() };
  return {
    title: match[1].trim(),
    chapter: match[2]?.trim() || undefined,
  };
}
