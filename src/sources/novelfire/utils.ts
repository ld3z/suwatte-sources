import { BASE_URL } from "./constants";

export function absoluteUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${BASE_URL}${url}`;
  return url;
}

/** Waits if the runtime provides timers; otherwise resolves immediately. */
export function wait(ms: number): Promise<void> {
  const setTimer = (globalThis as any).setTimeout;
  return typeof setTimer === "function"
    ? new Promise((resolve) => setTimer(resolve, ms))
    : Promise.resolve();
}

export function nonEmpty<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

/** Parses counts like "70.1M", "29K", or "1,234". */
export function parseCompactNumber(value?: string): number | undefined {
  const match = value?.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return undefined;
  const multipliers: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 };
  const number = parseFloat(match[1]) * (multipliers[match[2]?.toUpperCase() ?? ""] ?? 1);
  return isNaN(number) ? undefined : Math.round(number);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
