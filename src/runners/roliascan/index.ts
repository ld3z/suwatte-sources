import {
    Chapter,
    ChapterData,
    Content,
    ContentSource,
    DirectoryConfig,
    DirectoryRequest,
    ImageRequestHandler,
    NetworkRequest,
    PagedResult,
    PageLink,
    PageLinkResolver,
    PageSection,
    ResolvedPageSection,
    SectionStyle,
    SourceConfig,
} from "@suwatte/daisuke";
import { INFO, BASE_URL, PREFIX_SEARCH } from "./constants";
import { SimpleNetworkClient, parseContentId, buildContentId, extractSlug } from "./helpers";
import {
    getPopularManga,
    searchManga,
    getMangaDetails,
    getChapters,
    getChapterPages,
    getLatestUpdates,
} from "./parser";

export class Target
    implements ContentSource, ImageRequestHandler, PageLinkResolver {
    info = INFO;
    config: SourceConfig = {
        cloudflareResolutionURL: "https://roliascan.com",
        disableChapterDataCaching: true,
    };
    private client: SimpleNetworkClient = new NetworkClient();

    // --- PageLinkResolver ---
    async resolvePageSection(
        _link: PageLink,
        _sectionID: string
    ): Promise<ResolvedPageSection> {
        throw new Error("Method not implemented.");
    }

    async getSectionsForPage(_link: PageLink): Promise<PageSection[]> {
        try {
            const highlights = await getPopularManga(this.client);
            const latest = await getLatestUpdates(this.client);
            return [
                {
                    id: "popular",
                    title: "Popular Lately",
                    style: SectionStyle.GALLERY,
                    items: highlights,
                },
                {
                    id: "latest",
                    title: "Latest Updates",
                    style: SectionStyle.STANDARD_GRID,
                    items: latest,
                },
            ];
        } catch (error: any) {
            if (error?.name === "CloudflareError") {
                throw error;
            }
            console.error("Failed to load home sections:", error);
            return [
                {
                    id: "info",
                    title: "Rolia Scan",
                    style: SectionStyle.PADDED_LIST,
                    items: [
                        {
                            id: "info",
                            title: "Rolia Scan",
                            subtitle: "Search for manga using the search bar",
                            cover: "/assets/roliascan_logo.png",
                        },
                    ],
                },
            ];
        }
    }

    // --- ContentSource ---
    async getContent(contentId: string): Promise<Content> {
        const slug = parseContentId(contentId);
        return getMangaDetails(slug, this.client);
    }

    async getChapters(contentId: string): Promise<Chapter[]> {
        const slug = parseContentId(contentId);
        return getChapters(slug, this.client);
    }

    async getChapterData(
        _contentId: string,
        chapterId: string
    ): Promise<ChapterData> {
        // chapterId is the full chapter URL
        return getChapterPages(chapterId, this.client);
    }

    async getDirectory(request: DirectoryRequest): Promise<PagedResult> {
        const query = request.query?.trim() || "";

        // Handle slug-based search (PREFIX_SEARCH)
        if (query.startsWith(PREFIX_SEARCH)) {
            const slug = query.substring(PREFIX_SEARCH.length);
            try {
                const content = await getMangaDetails(slug, this.client);
                return {
                    results: [
                        {
                            id: buildContentId(slug),
                            title: content.title,
                            cover: content.cover,
                        },
                    ],
                    isLastPage: true,
                };
            } catch {
                return { results: [], isLastPage: true };
            }
        }

        // Show popular manga when no query
        if (!query) {
            try {
                const highlights = await getPopularManga(this.client);
                return {
                    results: highlights,
                    isLastPage: true,
                };
            } catch {
                return { results: [], isLastPage: true };
            }
        }

        // Search by query
        try {
            const results = await searchManga(query, this.client);
            return {
                results,
                isLastPage: true, // RoliaScan doesn't have pagination for search
            };
        } catch (error: any) {
            if (error?.name === "CloudflareError") {
                throw error;
            }
            console.error("Search failed:", error);
            return {
                results: [
                    {
                        id: "error",
                        title: "Search failed",
                        subtitle: "Please try again later",
                        cover: "/assets/roliascan_logo.png",
                    },
                ],
                isLastPage: true,
            };
        }
    }

    async getDirectoryConfig(): Promise<DirectoryConfig> {
        return { filters: [] };
    }

    // --- ImageRequestHandler ---
    async willRequestImage(url: string): Promise<NetworkRequest> {
        return {
            url,
            headers: {
                Referer: `${BASE_URL}/`,
            },
        };
    }
}
