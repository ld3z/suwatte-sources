import {
    Content,
    Highlight,
    Chapter,
    ChapterData,
    PublicationStatus,
} from "@suwatte/daisuke";
import { BASE_URL } from "./constants";
import {
    SimpleNetworkClient,
    fetchJSON,
    fetchText,
    parseDoc,
    parseDate,
    buildContentId,
    extractSlug,
    toAbsoluteUrl,
} from "./helpers";
import { PopularWrapper, MangaDto } from "./types";

/**
 * Get popular manga from the pre-built JSON file
 */
export async function getPopularManga(
    client: SimpleNetworkClient
): Promise<Highlight[]> {
    const url = `${BASE_URL}/wp-content/themes/animacewp/most_viewed_series.json`;
    const data = await fetchJSON<PopularWrapper>(url, client);

    return data.most_viewed_series
        .filter((m) => {
            if (!m.title || m.title.trim().length === 0) return false;
            return m.title.toLowerCase() !== "roliascan";
        })
        .map((m) => ({
            id: buildContentId(extractSlug(m.url)),
            title: m.title,
            cover: m.image,
        }));
}

/**
 * Search manga by query
 */
export async function searchManga(
    query: string,
    client: SimpleNetworkClient
): Promise<Highlight[]> {
    const url = `${BASE_URL}/manga?_post_type_search_box=${encodeURIComponent(query)}`;
    const html = await fetchText(url, client);
    const $ = parseDoc(html);

    const results: Highlight[] = [];
    const queryParts = query.toLowerCase().split(" ").filter((p) => p.trim().length > 0);

    $("div.post").each((_, el) => {
        const $el = $(el);
        const $link = $el.find("h6 a").first();
        const title = $link.text().trim();
        const href = $link.attr("href") || "";
        const cover = $el.find("img").first().attr("src") || "";

        if (title && href) {
            // Basic client-side filtering: Check if title contains at least one part of the query
            // The site search is sometimes too broad or too strict, but if it returns results,
            // we want to ensure they are relevant.
            const titleLower = title.toLowerCase();
            const matches = queryParts.some((part) => titleLower.includes(part));

            if (matches || queryParts.length === 0) {
                results.push({
                    id: buildContentId(extractSlug(href)),
                    title,
                    cover: toAbsoluteUrl(BASE_URL, cover),
                });
            }
        }
    });

    return results;
}

/**
 * Get latest updates from manga list page
 */
export async function getLatestUpdates(
    client: SimpleNetworkClient
): Promise<Highlight[]> {
    const url = `${BASE_URL}/manga?m_orderby=latest`;
    const html = await fetchText(url, client);
    const $ = parseDoc(html);

    const results: Highlight[] = [];

    $("div.post").each((_, el) => {
        const $el = $(el);
        const $link = $el.find("h6 a").first();
        const title = $link.text().trim();
        const href = $link.attr("href") || "";
        const cover = $el.find("img").first().attr("src") || "";

        if (title && href) {
            results.push({
                id: buildContentId(extractSlug(href)),
                title,
                cover: toAbsoluteUrl(BASE_URL, cover),
            });
        }
    });

    return results;
}

/**
 * Get manga details from detail page
 */
export async function getMangaDetails(
    slug: string,
    client: SimpleNetworkClient
): Promise<Content> {
    const url = `${BASE_URL}/manga/${slug}`;
    const html = await fetchText(url, client);
    const $ = parseDoc(html);

    // Title
    const title = $("h1").first().text().trim() || "Unknown";

    // Cover image
    const coverImg = $("div.post-type-single-column img.wp-post-image").first();
    const cover = coverImg.attr("src") || "";

    // Synopsis - collect all paragraphs in the Synopsis section
    const synopsisParagraphs: string[] = [];
    $("div.card-body:has(h5:contains(Synopsis)) p").each((_, el) => {
        const text = $(el).text().trim();
        if (text) synopsisParagraphs.push(text);
    });
    const summary = synopsisParagraphs.join("\n") || "No synopsis available.";

    // Genres
    const genres: string[] = [];
    $("a[href*=genres]").each((_, el) => {
        const genre = $(el).text().trim();
        if (genre) genres.push(genre);
    });

    // Artist
    const artist = $("tr:has(th:contains(Artist)) > td").first().text().trim();

    // Status
    const statusText = $("tr:has(th:contains(Status)) > td").first().text().trim().toLowerCase();
    let status = PublicationStatus.ONGOING;
    if (statusText.includes("completed")) {
        status = PublicationStatus.COMPLETED;
    } else if (statusText.includes("hiatus")) {
        status = PublicationStatus.HIATUS;
    } else if (statusText.includes("cancelled") || statusText.includes("canceled")) {
        status = PublicationStatus.CANCELLED;
    }

    const content: Content = {
        title,
        cover: toAbsoluteUrl(BASE_URL, cover),
        summary,
        status,
        webUrl: url,
    };

    // Add creators if artist exists
    if (artist) {
        content.creators = [artist];
    }

    // Add genres as properties
    if (genres.length > 0) {
        content.properties = [
            {
                id: "genres",
                title: "Genres",
                tags: genres.map((g) => ({ id: g.toLowerCase(), title: g })),
            },
        ];
    }

    return content;
}

/**
 * Get chapters for a manga with pagination
 */
export async function getChapters(
    slug: string,
    client: SimpleNetworkClient
): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
        const url = `${BASE_URL}/manga/${slug}/chapterlist/?chap_page=${page}`;
        const html = await fetchText(url, client);
        const $ = parseDoc(html);

        const rows = $(".chapter-list-row:has(.chapter-cell)");

        rows.each((idx, el) => {
            const $el = $(el);
            const $link = $el.find("a.seenchapter").first();
            const name = $link.text().trim();
            const href = $link.attr("href") || "";
            const dateText = $el.find(".chapter-date").first().text().trim();

            if (name && href) {
                // Extract chapter number from name (e.g., "Chapter 123" -> 123)
                const numMatch = name.match(/(\d+(?:\.\d+)?)/);
                const chapterNum = numMatch ? parseFloat(numMatch[1]) : chapters.length + 1;

                chapters.push({
                    chapterId: href,
                    title: name,
                    number: chapterNum,
                    date: parseDate(dateText),
                    language: "en",
                    index: chapters.length,
                });
            }
        });

        // Check for next page
        hasNextPage = $("a.page-link:contains(Next)").length > 0;
        page++;
    }

    return chapters;
}

/**
 * Get chapter pages (images)
 */
export async function getChapterPages(
    chapterUrl: string,
    client: SimpleNetworkClient
): Promise<ChapterData> {
    const html = await fetchText(chapterUrl, client);
    const $ = parseDoc(html);

    const pages: { url: string }[] = [];

    $(".manga-child-the-content img").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
            pages.push({ url: toAbsoluteUrl(BASE_URL, src) });
        }
    });

    return { pages };
}
