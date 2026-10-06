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

/** Largest forward jump accepted from a title; bigger jumps are treated as typos. */
const MAX_CHAPTER_JUMP = 100;
/**
 * Largest step back accepted from a title, so interleaved translation groups
 * and slightly out-of-order uploads keep their numbers; bigger drops are
 * typos or arc resets.
 */
const MAX_CHAPTER_DROP = 5;

/**
 * Chooses chapter numbers from titles, for chapters given oldest first.
 * Title numbers that drop well below the highest so far (arc resets, typos) or
 * jump too far ahead are ignored. Chapters without a usable number are placed by context:
 * extras wedged between consecutive chapters get decimals (7.1, 7.2, ...),
 * runs filling a real gap get the missing whole numbers, and trailing runs
 * (side stories after the finale) keep counting up. Novels with no numbered
 * titles fall back to the site's positions.
 */
export function resolveChapterNumbers(
  chapters: { title?: string; position: number }[]
): number[] {
  let highest: number | null = null;
  const numbers: (number | null)[] = chapters.map(({ title }) => {
    const parsed = parseChapterNumber(title);
    const accepted =
      parsed !== null &&
      (highest === null ||
        (parsed >= highest - MAX_CHAPTER_DROP && parsed - highest <= MAX_CHAPTER_JUMP));
    if (!accepted) return null;
    highest = highest === null ? parsed : Math.max(highest, parsed);
    return parsed;
  });

  if (highest === null) return chapters.map((ch) => ch.position);

  for (let start = 0; start < numbers.length; start++) {
    if (numbers[start] !== null) continue;
    let end = start;
    while (end < numbers.length && numbers[end] === null) end++;
    const count = end - start;
    const before = start > 0 ? numbers[start - 1] : null;
    const after = end < numbers.length ? numbers[end] : null;

    for (let j = 0; j < count; j++) {
      numbers[start + j] = fillNumber(before, after, j, count);
    }
    start = end;
  }
  return numbers as number[];
}

function fillNumber(
  before: number | null,
  after: number | null,
  j: number,
  count: number
): number {
  if (before === null) {
    // Leading run (e.g. "Prologue") placed just before the first numbered chapter.
    return Math.max(0, after! - count + j);
  }
  if (after === null || after - before > count) {
    return before + j + 1;
  }
  const step = count < 10 ? 0.1 : count < 100 ? 0.01 : 1 / (count + 1);
  return Number((before + step * (j + 1)).toFixed(4));
}

/**
 * Reads the first number after "Chapter"/"Ch." in a title, e.g. "Chapter 5.1",
 * "POV - Chapter 469: ...", "Chapter 31-40". Side stories ("Chapter ss100",
 * "Side Stories Chapter 101") have their own numbering, so they count as unnumbered.
 */
function parseChapterNumber(title?: string): number | null {
  if (!title || /side\s*stor|\bss\s*\d/i.test(title)) return null;
  const match = title.match(/\b(?:chapter|ch\.?)[^\p{L}\d]{0,6}(\d+(?:\.\d+)?)/iu);
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
