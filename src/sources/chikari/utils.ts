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

/** Returns the excluded ids of a select filter value. */
export function excludedIds(value: unknown): string[] {
  return (value as { exclude?: string[] } | undefined)?.exclude ?? [];
}

export function nonEmpty<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

export function matchesHiddenKeyword(
  item: { title?: string },
  keywords: string[]
): boolean {
  if (keywords.length === 0) return false;
  const title = item.title?.toLowerCase() ?? "";
  return keywords.some((k) => title.includes(k));
}
