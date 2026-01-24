import { load, CheerioAPI } from "cheerio";

export interface SimpleNetworkClient {
    get(url: string, config?: any): Promise<{ data: any }>;
}

/**
 * Fetch text content from a URL
 */
export async function fetchText(
    url: string,
    client: SimpleNetworkClient
): Promise<string> {
    const res = await client.get(url, {
        headers: { Accept: "text/html,application/json" },
    });
    if (typeof res.data === "string") return res.data;
    try {
        return JSON.stringify(res.data);
    } catch {
        return "";
    }
}

/**
 * Fetch and parse JSON from a URL
 */
export async function fetchJSON<T>(
    url: string,
    client: SimpleNetworkClient
): Promise<T> {
    const res = await client.get(url, {
        headers: { Accept: "application/json" },
    });
    if (typeof res.data === "string") {
        return JSON.parse(res.data) as T;
    }
    return res.data as T;
}

/**
 * Parse HTML string to Cheerio document
 */
export function parseDoc(html: string): CheerioAPI {
    return load(html);
}

/**
 * Parse date in "MMMM dd, yyyy" format (e.g., "January 15, 2024")
 */
export function parseDate(dateText: string): Date {
    const trimmed = dateText.trim().toLowerCase();
    if (!trimmed) return new Date(0);

    // Handle relative dates
    if (trimmed.includes("ago")) {
        const parts = trimmed.split(" ");
        const amount = parseFloat(parts[0]);
        const unit = parts[1];

        if (isNaN(amount)) return new Date();

        const now = new Date();
        if (unit.startsWith("second")) now.setSeconds(now.getSeconds() - amount);
        else if (unit.startsWith("minute")) now.setMinutes(now.getMinutes() - amount);
        else if (unit.startsWith("hour")) now.setHours(now.getHours() - amount);
        else if (unit.startsWith("day")) now.setDate(now.getDate() - amount);
        else if (unit.startsWith("week")) now.setDate(now.getDate() - (amount * 7));
        else if (unit.startsWith("month")) now.setMonth(now.getMonth() - amount);
        else if (unit.startsWith("year")) now.setFullYear(now.getFullYear() - amount);

        return now;
    }

    if (trimmed.includes("yesterday")) {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d;
    }

    if (trimmed.includes("today")) {
        return new Date();
    }

    // Try parsing directly
    const parsed = new Date(dateText);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    return new Date(0);
}

/**
 * Build manga content ID
 */
export function buildContentId(slug: string): string {
    return `roliascan|${slug}`;
}

/**
 * Parse content ID to get slug
 */
export function parseContentId(contentId: string): string {
    const parts = contentId.split("|");
    if (parts.length < 2) {
        // Assume it's just a slug
        return contentId;
    }
    return parts[1];
}

/**
 * Extract slug from manga URL
 */
export function extractSlug(url: string): string {
    // URL format: https://roliascan.com/manga/slug
    const match = url.match(/\/manga\/([^\/]+)/);
    return match ? match[1] : url;
}

/**
 * Get absolute URL from relative path
 */
export function toAbsoluteUrl(base: string, path: string): string {
    if (path.startsWith("http")) return path;
    if (path.startsWith("//")) return `https:${path}`;
    if (path.startsWith("/")) return `${base}${path}`;
    return `${base}/${path}`;
}
