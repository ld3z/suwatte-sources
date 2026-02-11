import { NetworkClientBuilder, NetworkRequest } from "@suwatte/daisuke";
import { load, CheerioAPI } from "cheerio";
import { BASE_URL } from "./constants";

export interface SimpleNetworkClient {
    get(url: string, headers?: Record<string, string>): Promise<string>;
    postForm(url: string, body: Record<string, any>, headers?: Record<string, string>): Promise<string>;
}

/**
 * Network client with rate limiting and CSRF token management.
 * Uses Suwatte's global NetworkClient (via builder) internally.
 */
export class MangaBallClient implements SimpleNetworkClient {
    private client: NetworkClient;
    private csrfToken: string | null = null;
    private csrfPromise: Promise<string> | null = null;

    constructor() {
        this.client = new NetworkClientBuilder()
            .setRateLimit(5, 1)
            .build();
    }

    async get(url: string, extraHeaders?: Record<string, string>): Promise<string> {
        const headers: Record<string, string> = {
            Referer: `${BASE_URL}/`,
            ...(extraHeaders || {}),
        };

        const response = await this.client.get(url, { headers });
        return response.data;
    }

    /**
     * Fetch CSRF token from homepage meta tag.
     * Deduplicates concurrent calls so parallel requests share a single fetch.
     */
    private async fetchCSRF(): Promise<string> {
        if (this.csrfToken) return this.csrfToken;

        if (!this.csrfPromise) {
            this.csrfPromise = this.get(BASE_URL).then((html) => {
                const $ = parseDoc(html);
                const token = $('meta[name="csrf-token"]').attr("content");
                if (!token) {
                    throw new Error("CSRF token not found");
                }
                this.csrfToken = token;
                return token;
            }).finally(() => {
                this.csrfPromise = null;
            });
        }

        return this.csrfPromise;
    }

    /**
     * Extract CSRF from a fetched HTML document to avoid extra requests
     */
    extractCSRF(html: string): void {
        const $ = parseDoc(html);
        const token = $('meta[name="csrf-token"]').attr("content");
        if (token) {
            this.csrfToken = token;
        }
    }

    /**
     * POST form data with CSRF token.
     */
    async postForm(
        url: string,
        body: Record<string, any>,
        extraHeaders?: Record<string, string>,
    ): Promise<string> {
        const token = await this.fetchCSRF();

        const headers: Record<string, string> = {
            Referer: `${BASE_URL}/`,
            "content-type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": token,
            ...(extraHeaders || {}),
        };

        const response = await this.client.post(url, { headers, body });
        return response.data;
    }
}

/**
 * Parse HTML string to Cheerio document
 */
export function parseDoc(html: string): CheerioAPI {
    return load(html);
}

/**
 * Parse date in "yyyy-MM-dd HH:mm:ss" format
 */
export function parseDate(dateStr: string): Date {
    if (!dateStr) return new Date(0);

    const iso = dateStr.trim().replace(" ", "T") + "Z";
    const parsed = new Date(iso);

    if (isNaN(parsed.getTime())) {
        return new Date(0);
    }

    return parsed;
}

/**
 * Extract slug from a mangaball URL path
 * e.g. "/title-detail/some-manga-12345/" -> "some-manga-12345"
 */
export function extractSlug(url: string): string {
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const segments = path.split("/").filter(Boolean);

    if (segments.length >= 2 && segments[0] === "title-detail") {
        return segments[1];
    }

    return segments[segments.length - 1] || url;
}

/**
 * Extract title ID from slug (the part after the last hyphen)
 * e.g. "some-manga-12345" -> "12345"
 */
export function extractTitleId(slug: string): string {
    return slug.substring(slug.lastIndexOf("-") + 1);
}

/**
 * Check if a group ID looks like a generated MongoDB ObjectId (24 hex chars)
 */
export function isGeneratedGroupId(id: string): boolean {
    return /^[a-z0-9]{24}$/.test(id);
}
