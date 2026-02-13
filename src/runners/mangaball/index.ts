import {
    Chapter,
    ChapterData,
    Content,
    ContentSource,
    DirectoryConfig,
    DirectoryRequest,
    FilterType,
    Highlight,
    ImageRequestHandler,
    NetworkRequest,
    PagedResult,
    PageLink,
    PageLinkResolver,
    PageSection,
    ResolvedPageSection,
    SectionStyle,
    RunnerPreferenceProvider,
    UIToggle,
} from "@suwatte/daisuke";
import {
    BASE_URL,
    INFO,
    SORT_OPTIONS,
    CONTENT_OPTIONS,
    FORMAT_OPTIONS,
    GENRE_OPTIONS,
    ORIGIN_OPTIONS,
    THEME_OPTIONS,
    DEMOGRAPHIC_OPTIONS,
    STATUS_OPTIONS,
    LANGUAGE_OPTIONS,
} from "./constants";
import { MangaBallClient } from "./helpers";
import {
    getChapterPages,
    getChapters,
    getLatestManga,
    getMangaDetails,
    getPopularManga,
    resolveDeepLink,
    searchManga,
} from "./parser";

export class Target
    implements
    ContentSource,
    ImageRequestHandler,
    PageLinkResolver,
    RunnerPreferenceProvider {
    info = INFO;
    private client = new MangaBallClient();
    private hideNSFW: boolean = false;

    constructor() {
        this.initializePreferences();
    }

    private async initializePreferences(): Promise<void> {
        try {
            const stored = await ObjectStore.boolean("mangaball_hide_nsfw");
            if (stored !== null) {
                this.hideNSFW = stored;
            }
        } catch (error) {
            console.error("Failed to load preference:", error);
        }
    }

    // --- PageLinkResolver ---
    async resolvePageSection(
        _link: PageLink,
        _sectionID: string,
    ): Promise<ResolvedPageSection> {
        throw new Error("Method not implemented.");
    }

    async getSectionsForPage(_link: PageLink): Promise<PageSection[]> {
        try {
            const [popularSettled, latestSettled] = await Promise.allSettled([
                getPopularManga(1, this.client),
                getLatestManga(1, this.client),
            ]);

            const sections: PageSection[] = [];

            if (
                popularSettled.status === "fulfilled" &&
                popularSettled.value.highlights.length > 0
            ) {
                let items = popularSettled.value.highlights;
                if (this.hideNSFW) items = items.filter((h) => !h.title.includes("[H]"));
                sections.push({
                    id: "popular",
                    title: "Popular",
                    style: SectionStyle.GALLERY,
                    items: items.slice(0, 20),
                });
            }

            if (
                latestSettled.status === "fulfilled" &&
                latestSettled.value.highlights.length > 0
            ) {
                let items = latestSettled.value.highlights;
                if (this.hideNSFW) items = items.filter((h) => !h.title.includes("[H]"));
                sections.push({
                    id: "latest",
                    title: "Latest Updates",
                    style: SectionStyle.STANDARD_GRID,
                    items: items.slice(0, 20),
                });
            }

            if (sections.length > 0) {
                return sections;
            }

            return [
                {
                    id: "info",
                    title: "Manga Ball",
                    style: SectionStyle.PADDED_LIST,
                    items: [
                        {
                            id: "info",
                            title: "Manga Ball",
                            subtitle: "Search for manga using the search bar",
                            cover: "",
                        },
                    ],
                },
            ];
        } catch (error) {
            console.error("getSectionsForPage failed:", error);
            return [
                {
                    id: "info",
                    title: "Manga Ball",
                    style: SectionStyle.PADDED_LIST,
                    items: [
                        {
                            id: "info",
                            title: "Manga Ball",
                            subtitle: "Search for manga using the search bar",
                            cover: "",
                        },
                    ],
                },
            ];
        }
    }

    // --- ContentSource ---
    async getContent(contentId: string): Promise<Content> {
        try {
            // Check if contentId is a full URL (deep link)
            if (contentId.startsWith("https://")) {
                const slug = await resolveDeepLink(contentId, this.client);
                if (slug) {
                    return await getMangaDetails(slug, this.client);
                }
                throw new Error("Could not resolve URL");
            }
            return await getMangaDetails(contentId, this.client);
        } catch (error) {
            console.error(`Failed to get content ${contentId}:`, error);
            throw new Error(
                `Failed to load manga: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    async getChapters(contentId: string): Promise<Chapter[]> {
        try {
            return await getChapters(contentId, this.client);
        } catch (error) {
            console.error(`Failed to get chapters for ${contentId}:`, error);
            return [];
        }
    }

    async getChapterData(
        _contentId: string,
        chapterId: string,
    ): Promise<ChapterData> {
        try {
            return await getChapterPages(chapterId, this.client);
        } catch (error) {
            console.error(`Failed to get chapter data for ${chapterId}:`, error);
            throw new Error(
                `Failed to load chapter pages: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    async getDirectory(request: DirectoryRequest): Promise<PagedResult> {
        const query = request.query?.trim() || "";
        const page = request.page || 1;

        try {
            // Build filters from request
            const filters: {
                sort?: string;
                demographic?: string;
                status?: string;
                language?: string;
                tagIncluded?: string[];
                tagExcluded?: string[];
                tagIncludeMode?: string;
                tagExcludeMode?: string;
            } = {};

            if (request.filters) {
                if (request.filters.sort) {
                    filters.sort = request.filters.sort as string;
                }
                if (request.filters.demographic) {
                    filters.demographic = request.filters.demographic as string;
                }
                if (request.filters.status) {
                    filters.status = request.filters.status as string;
                }
                if (request.filters.language) {
                    filters.language = request.filters.language as string;
                }
                if (request.filters.tag_include_mode) {
                    filters.tagIncludeMode = request.filters.tag_include_mode as string;
                }
                if (request.filters.tag_exclude_mode) {
                    filters.tagExcludeMode = request.filters.tag_exclude_mode as string;
                }

                // Collect included tags from all tag groups
                const included: string[] = [];
                const excluded: string[] = [];

                for (const groupId of ["content", "format", "genre", "origin", "theme"]) {
                    const val = request.filters[groupId];
                    if (val && typeof val === "object" && !Array.isArray(val)) {
                        const tagFilter = val as { included?: string[]; excluded?: string[] };
                        if (tagFilter.included) included.push(...tagFilter.included);
                        if (tagFilter.excluded) excluded.push(...tagFilter.excluded);
                    }
                }

                if (included.length > 0) filters.tagIncluded = included;
                if (excluded.length > 0) filters.tagExcluded = excluded;
            }

            // Default sort for browse (no query)
            if (!query && !filters.sort) {
                filters.sort = "views_desc";
            }

            const result = await searchManga(query, page, filters, this.client);

            let highlights = result.highlights;
            if (this.hideNSFW) {
                highlights = highlights.filter((h) => !h.title.includes("[H]"));
            }

            return {
                results: highlights,
                isLastPage: !result.hasNextPage,
            };
        } catch (error) {
            console.error("getDirectory failed:", error);
            return {
                results: [],
                isLastPage: true,
            };
        }
    }

    async getDirectoryConfig(): Promise<DirectoryConfig> {
        return {
            filters: [
                {
                    type: FilterType.SELECT,
                    id: "sort",
                    title: "Sort By",
                    options: SORT_OPTIONS.map(([title, id]) => ({ id, title })),
                },
                {
                    type: FilterType.SELECT,
                    id: "demographic",
                    title: "Magazine Demographic",
                    options: DEMOGRAPHIC_OPTIONS.map(([title, id]) => ({ id, title })),
                },
                {
                    type: FilterType.SELECT,
                    id: "status",
                    title: "Publication Status",
                    options: STATUS_OPTIONS.map(([title, id]) => ({ id, title })),
                },
                {
                    type: FilterType.SELECT,
                    id: "language",
                    title: "Translated Language",
                    options: LANGUAGE_OPTIONS.map(([title, id]) => ({ id, title })),
                },
                {
                    type: FilterType.EXCLUDABLE_MULTISELECT,
                    id: "content",
                    title: "Content",
                    options: CONTENT_OPTIONS.map(([title, id]) => ({ id, title })),
                },
                {
                    type: FilterType.EXCLUDABLE_MULTISELECT,
                    id: "format",
                    title: "Format",
                    options: FORMAT_OPTIONS.map(([title, id]) => ({ id, title })),
                },
                {
                    type: FilterType.EXCLUDABLE_MULTISELECT,
                    id: "genre",
                    title: "Genre",
                    options: GENRE_OPTIONS.map(([title, id]) => ({ id, title })),
                },
                {
                    type: FilterType.EXCLUDABLE_MULTISELECT,
                    id: "origin",
                    title: "Origin",
                    options: ORIGIN_OPTIONS.map(([title, id]) => ({ id, title })),
                },
                {
                    type: FilterType.EXCLUDABLE_MULTISELECT,
                    id: "theme",
                    title: "Theme",
                    options: THEME_OPTIONS.map(([title, id]) => ({ id, title })),
                },
                {
                    type: FilterType.SELECT,
                    id: "tag_include_mode",
                    title: "Tag Include Mode",
                    options: [
                        { id: "and", title: "AND" },
                        { id: "or", title: "OR" },
                    ],
                },
                {
                    type: FilterType.SELECT,
                    id: "tag_exclude_mode",
                    title: "Tag Exclude Mode",
                    options: [
                        { id: "and", title: "AND" },
                        { id: "or", title: "OR" },
                    ],
                },
            ],
        };
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

    // --- RunnerPreferenceProvider ---
    async getPreferenceMenu(): Promise<{ sections: any[] }> {
        return {
            sections: [
                {
                    header: "General",
                    children: [
                        UIToggle({
                            id: "hide_nsfw",
                            title: "Hide NSFW Content",
                            value: this.hideNSFW,
                            didChange: async (value: boolean) => {
                                this.hideNSFW = value;
                                try {
                                    await ObjectStore.set("mangaball_hide_nsfw", value);
                                } catch (error) {
                                    console.error("Failed to save preference:", error);
                                }
                            },
                        }),
                    ],
                },
            ],
        };
    }
}
