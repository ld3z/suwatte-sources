/** Builds a query string, skipping empty values. */
export function buildQueryString(
  params: Record<string, string | number | undefined | null>
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

/** Parses the JSON-encoded string arrays the database API uses for genres, themes and titles. */
export function parseJsonArray(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string" && v.trim()) : [];
  } catch {
    return [];
  }
}

/** Reads a count that may arrive as a number or as text like "21528 novels (estimated)". */
export function parseCount(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : parseInt(String(value ?? "").replace(/,/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export function nonEmpty<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^\p{L}\d]+/gu, "-").replace(/^-|-$/g, "");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
