/** Builds a query string, skipping empty values. */
export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>
): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

/** Returns the included ids of a select filter value. */
export function selectedIds(value: unknown): string[] {
  return (value as { include?: string[] } | undefined)?.include ?? [];
}

/** Returns the excluded ids of a select filter value. */
export function excludedIds(value: unknown): string[] {
  return (value as { exclude?: string[] } | undefined)?.exclude ?? [];
}

export function nonEmpty<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

export function parseDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

/** Reads the first number after "Chapter"/"Ch." in a title, or a leading number ("333 The Finale"). */
export function parseChapterNumber(title?: string): number | null {
  if (!title) return null;
  const match =
    title.match(/\b(?:chapter|ch\.?)[^\p{L}\d]{0,6}(\d+(?:\.\d+)?)/iu) ??
    title.match(/^\s*(\d+(?:\.\d+)?)\b/);
  return match ? parseFloat(match[1]) : null;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
