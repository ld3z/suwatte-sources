import {
    Content,
    Highlight,
    Chapter,
    ChapterData,
    PublicationStatus,
} from "@suwatte/daisuke";
import { BASE_URL, LANG_TO_SUWATTE } from "./constants";
import {
    MangaBallClient,
    parseDoc,
    parseDate,
    extractSlug,
    extractTitleId,
    isGeneratedGroupId,
} from "./helpers";
import {
    SearchResponse,
    SmartSearchResponse,
    ChapterListResponse,
    Yoast,
} from "./types";

/**
 * Search manga using the smart-search API (text query)
 */
async function smartSearch(
    query: string,
    client: MangaBallClient,
): Promise<{ highlights: Highlight[]; hasNextPage: boolean; isAdultFlags: Map<string, boolean> }> {
    const url = `${BASE_URL}/api/v1/smart-search/search/`;
    const response = await client.postForm(url, { search_input: query.trim() });

    const data: SmartSearchResponse =
        typeof response === "string" ? JSON.parse(response) : response;

    const isAdultFlags = new Map<string, boolean>();
    const highlights: Highlight[] = (data.data.manga || []).map((item) => {
        const slug = extractSlug(item.url);
        // Keep parenthetical info like "(Fan Colored)" but strip alt-name lists
        // that contain commas or slashes, e.g. "(ワンピース, 海贼王)" or "(ワンピース/BAH/One piece)"
        const title = item.title.replace(/\s*\([^)]*[,/][^)]*\)/g, "").trim() || item.title;
        return {
            id: slug,
            title,
            cover: item.img,
        };
    });

    return { highlights, hasNextPage: false, isAdultFlags };
}

/**
 * Browse / filter manga via the advanced search API
 */
async function advancedSearch(
    query: string,
    page: number,
    filters: {
        sort?: string;
        demographic?: string;
        status?: string;
        language?: string;
        tagIncluded?: string[];
        tagExcluded?: string[];
        tagIncludeMode?: string;
        tagExcludeMode?: string;
    },
    client: MangaBallClient,
): Promise<{ highlights: Highlight[]; hasNextPage: boolean; isAdultFlags: Map<string, boolean> }> {
    const body: Record<string, any> = {
        search_input: query.trim(),
        "filters[sort]": filters.sort || "updated_chapters_desc",
        "filters[page]": page.toString(),
        "filters[tag_included_mode]": filters.tagIncludeMode || "and",
        "filters[tag_excluded_mode]": filters.tagExcludeMode || "and",
        "filters[contentRating]": "any",
        "filters[demographic]": filters.demographic || "any",
        "filters[person]": "any",
        "filters[publicationYear]": "",
        "filters[publicationStatus]": filters.status || "any",
    };

    // Language filter: "any" means no filter, otherwise filter to specific language
    const lang = filters.language || "any";
    if (lang !== "any") {
        body["filters[translatedLanguage][]"] = lang;
    }

    // Included tags
    if (filters.tagIncluded && filters.tagIncluded.length > 0) {
        body["filters[tag_included_ids][]"] = filters.tagIncluded;
    }

    // Excluded tags
    if (filters.tagExcluded && filters.tagExcluded.length > 0) {
        body["filters[tag_excluded_ids][]"] = filters.tagExcluded;
    }

    const url = `${BASE_URL}/api/v1/title/search-advanced/`;
    const response = await client.postForm(url, body);

    const data: SearchResponse =
        typeof response === "string" ? JSON.parse(response) : response;

    const isAdultFlags = new Map<string, boolean>();
    const highlights: Highlight[] = data.data.map((item) => {
        const slug = extractSlug(item.url);
        isAdultFlags.set(slug, item.isAdult);
        return {
            id: slug,
            title: item.name,
            cover: item.cover,
        };
    });

    const hasNextPage = data.pagination.current_page < data.pagination.last_page;

    return { highlights, hasNextPage, isAdultFlags };
}

/**
 * Search / browse manga — uses smart-search for text queries, advanced search for browsing/filters
 */
export async function searchManga(
    query: string,
    page: number,
    filters: {
        sort?: string;
        demographic?: string;
        status?: string;
        language?: string;
        tagIncluded?: string[];
        tagExcluded?: string[];
        tagIncludeMode?: string;
        tagExcludeMode?: string;
    },
    client: MangaBallClient,
): Promise<{ highlights: Highlight[]; hasNextPage: boolean; isAdultFlags: Map<string, boolean> }> {
    const hasFilters = filters.demographic || filters.status || filters.language ||
        (filters.tagIncluded && filters.tagIncluded.length > 0) ||
        (filters.tagExcluded && filters.tagExcluded.length > 0);

    // Use smart-search for text queries without filters (page 1 only, no pagination)
    if (query.trim() && !hasFilters && page === 1) {
        return smartSearch(query, client);
    }

    return advancedSearch(query, page, filters, client);
}

/**
 * Get manga details by scraping the title-detail page
 */
export async function getMangaDetails(
    slug: string,
    client: MangaBallClient,
): Promise<Content> {
    const url = `${BASE_URL}/title-detail/${slug}/`;
    const html = await client.get(url);
    const $ = parseDoc(html);

    // Extract CSRF from this page to avoid extra requests
    client.extractCSRF(html);

    const title = $("#comicDetail h6").first().contents().not("span").text().trim()
        || $("#comicDetail h6").first().text().trim()
        || "Unknown";

    const cover = $("img.featured-cover").first().attr("src") || "";

    // Genres
    const genres: string[] = [];
    // Detect origin type from flag image
    const flagImg = $("#featuredComicsCarousel img[src*='/flags/']").first().attr("src") || "";
    if (flagImg.includes("jp")) genres.push("Manga");
    else if (flagImg.includes("kr")) genres.push("Manhwa");
    else if (flagImg.includes("cn")) genres.push("Manhua");

    // Tag genres
    $("#comicDetail span[data-tag-id]").each((_: number, el: any) => {
        const text = $(el).text().trim();
        if (text) genres.push(text);
    });

    // Author
    const authors: string[] = [];
    $("#comicDetail span[data-person-id]").each((_: number, el: any) => {
        const text = $(el).text().trim();
        if (text) authors.push(text);
    });

    // Description
    let description = "";
    const descEl = $("#descriptionContent p").first();
    if (descEl.length) {
        description = descEl.text().trim();
    }

    // Publication info
    const publishedBadge = $("#comicDetail span.badge:contains('Published')").first().text().trim();
    if (publishedBadge) {
        description += "\n\n" + publishedBadge;
    }

    // Alternative names
    const altNamesText = $("div.alternate-name-container").text().trim();
    const altNames = altNamesText ? altNamesText.split("/").map((s: string) => s.trim()).filter(Boolean) : [];
    if (altNames.length > 0) {
        description += "\n\nAlternative Names:\n" + altNames.map((n: string) => `- ${n}`).join("\n");
    }

    // Status
    const statusText = $("span.badge-status").first().text().trim();
    let status = PublicationStatus.ONGOING;
    switch (statusText) {
        case "Ongoing":
            status = PublicationStatus.ONGOING;
            break;
        case "Completed":
            status = PublicationStatus.COMPLETED;
            break;
        case "Hiatus":
            status = PublicationStatus.HIATUS;
            break;
        case "Cancelled":
            status = PublicationStatus.CANCELLED;
            break;
    }

    // Determine reading mode from origin (manhwa/manhua = webtoon)
    let recommendedPanelMode = 0;
    if (flagImg.includes("kr") || flagImg.includes("cn")) {
        recommendedPanelMode = 1;
    }

    const content: Content = {
        title,
        cover,
        summary: description.trim(),
        status,
        webUrl: url,
        recommendedPanelMode,
    };

    if (authors.length > 0) {
        content.creators = authors;
    }

    if (genres.length > 0) {
        content.properties = [
            {
                id: "genres",
                title: "Genres",
                tags: genres.map((g, i) => ({ id: `genre_${i}`, title: g })),
            },
        ];
    }

    if (altNames.length > 0) {
        content.additionalTitles = altNames;
    }

    return content;
}

/**
 * Get chapters for a manga from the chapter listing API
 */
export async function getChapters(
    slug: string,
    client: MangaBallClient,
): Promise<Chapter[]> {
    const titleId = extractTitleId(slug);

    const url = `${BASE_URL}/api/v1/chapter/chapter-listing-by-title-id/`;
    const response = await client.postForm(url, { title_id: titleId });

    const data: ChapterListResponse =
        typeof response === "string" ? JSON.parse(response) : response;

    const chapters: Chapter[] = [];

    data.ALL_CHAPTERS.forEach((container) => {
        container.translations.forEach((translation) => {
            const numberStr = container.number_float.toString().replace(/\.0$/, "");

            let title = "";
            if (translation.volume > 0) {
                title += `Vol. ${translation.volume} `;
            }
            if (translation.name.includes(numberStr)) {
                title += translation.name.trim();
            } else {
                title += `Ch. ${numberStr} ${translation.name.trim()}`;
            }

            // Build scanlator name
            let providers: { id: string; name: string }[] = [];
            const groupName = translation.group.name;
            if (isGeneratedGroupId(translation.group._id)) {
                providers.push({ id: translation.group._id, name: groupName });
            } else {
                providers.push({
                    id: translation.group._id,
                    name: `${groupName} (${translation.group._id})`,
                });
            }

            // Map mangaball language code to Suwatte language code
            const suwatteLang = LANG_TO_SUWATTE[translation.language] || translation.language;

            chapters.push({
                chapterId: translation.id,
                title: title.trim(),
                number: container.number_float,
                date: parseDate(translation.date),
                language: suwatteLang,
                index: chapters.length,
                providers,
                webUrl: `${BASE_URL}/chapter-detail/${translation.id}/`,
            });
        });
    });

    return chapters;
}

/**
 * Get chapter page images by scraping the chapter-detail page
 */
export async function getChapterPages(
    chapterId: string,
    client: MangaBallClient,
): Promise<ChapterData> {
    const url = `${BASE_URL}/chapter-detail/${chapterId}/`;
    const html = await client.get(url);
    const $ = parseDoc(html);

    // Extract CSRF from this page
    client.extractCSRF(html);

    // Extract images from inline script: const chapterImages = JSON.parse(`[...]`)
    const imagesRegex = /const\s+chapterImages\s*=\s*JSON\.parse\(`([^`]+)`\)/;
    let images: string[] = [];

    $("script").each((_: number, el: any) => {
        const scriptData = $(el).html() || "";
        const match = imagesRegex.exec(scriptData);
        if (match && match[1]) {
            try {
                images = JSON.parse(match[1]);
            } catch (e) {
                console.error("Failed to parse chapter images:", e);
            }
        }
    });

    if (images.length === 0) {
        throw new Error("No images found for this chapter");
    }

    return {
        pages: images.map((imgUrl) => ({ url: imgUrl })),
    };
}

/**
 * Resolve a deep link URL to a manga slug
 */
export async function resolveDeepLink(
    inputUrl: string,
    client: MangaBallClient,
): Promise<string | null> {
    try {
        const urlObj = new URL(inputUrl);
        const baseHost = new URL(BASE_URL).hostname;

        if (urlObj.hostname !== baseHost) return null;

        const segments = urlObj.pathname.split("/").filter(Boolean);
        if (segments.length < 2) return null;

        if (segments[0] === "title-detail") {
            return segments[1];
        }

        if (segments[0] === "chapter-detail") {
            // Fetch chapter page and extract the title URL from yoast schema
            const html = await client.get(inputUrl);
            const $ = parseDoc(html);
            const schemaData = $(".yoast-schema-graph").first().html();
            if (schemaData) {
                const yoast: Yoast = JSON.parse(schemaData);
                const webPage = yoast["@graph"].find((g) => g["@type"] === "WebPage");
                if (webPage?.url) {
                    return extractSlug(webPage.url);
                }
            }
        }
    } catch (e) {
        console.error("Deep link resolve failed:", e);
    }

    return null;
}

/**
 * Get popular manga (sorted by views descending)
 */
export async function getPopularManga(
    page: number,
    client: MangaBallClient,
): Promise<{ highlights: Highlight[]; hasNextPage: boolean }> {
    return searchManga("", page, { sort: "views_desc" }, client);
}

/**
 * Get latest updated manga
 */
export async function getLatestManga(
    page: number,
    client: MangaBallClient,
): Promise<{ highlights: Highlight[]; hasNextPage: boolean }> {
    return searchManga("", page, { sort: "updated_chapters_desc" }, client);
}
