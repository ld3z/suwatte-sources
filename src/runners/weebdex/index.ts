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
  RunnerPreferenceProvider,
  SectionStyle,
  SourceConfig,
  UIMultiPicker,
  UIToggle,
} from "@suwatte/daisuke";
import {
  BASE_URL,
  CONTENT_RATINGS,
  DEFAULT_CONTENT_RATINGS,
  DEMOGRAPHICS,
  INFO,
  PUBLICATION_STATUS,
  REQUIRED_HEADERS,
  LANGUAGE_OPTIONS,
  SITE_URL,
  SORT_OPTIONS,
  SORT_ORDER_OPTIONS,
  TAG_MODE_OPTIONS,
} from "./constants";
import {
  buildMangaId,
  formatChapterNumber,
  getCoverUrl,
  parseChapterId,
  parseMangaId,
  proxifyImage,
  SimpleNetworkClient,
} from "./helpers";
import {
  getAllChapters,
  getChapterData,
  getLatestFeed,
  getMangaById,
  getRecommendations,
  getTagList,
  getTopManga,
  mangaListToHighlights,
  mangaToContent,
  searchManga,
} from "./parser";

export class Target
  implements
    ContentSource,
    ImageRequestHandler,
    PageLinkResolver,
    RunnerPreferenceProvider
{
  info = INFO;
  config: SourceConfig = {
    cloudflareResolutionURL: SITE_URL,
  };
  private client: SimpleNetworkClient = new NetworkClient();
  private preferredLanguages: string[] = [];
  private hidePornographic: boolean = false;
  private _prefsLoaded: boolean = false;
  private tagFilterOptions: { id: string; title: string }[] | null = null;

  private async ensurePrefs(): Promise<void> {
    if (this._prefsLoaded) return;
    this._prefsLoaded = true;
    try {
      this.preferredLanguages =
        (await ObjectStore.stringArray(
          "weebdex_preferred_languages"
        )) ?? [];
    } catch {
      this.preferredLanguages = [];
    }
    try {
      const pref = await ObjectStore.boolean("weebdex_hide_pornographic");
      this.hidePornographic = pref ?? false;
    } catch {
      this.hidePornographic = false;
    }
  }

  async getPreferenceMenu(): Promise<{ sections: any[] }> {
    await this.ensurePrefs();
    return {
      sections: [
        {
          header: "General",
          footer: "Hide titles marked as NSFW (pornographic). Does not hide (erotica).",
          children: [
            UIToggle({
              id: "hide_nsfw_titles",
              title: "Hide NSFW Titles",
              value: this.hidePornographic,
              didChange: async (value: boolean) => {
                this.hidePornographic = value;
                try {
                  await ObjectStore.set("weebdex_hide_pornographic", value);
                } catch (error) {
                  console.error("Failed to save preference:", error);
                }
              },
            }),
          ],
        },
        {
          header: "Languages",
          footer:
            "Select preferred languages for chapters. Leave empty to show all languages.",
          children: [
            UIMultiPicker({
              id: "preferred_languages",
              title: "Preferred Languages",
              options: LANGUAGE_OPTIONS.map(([title, id]) => ({ id, title })),
              value: this.preferredLanguages,
              didChange: async (value: string[]) => {
                this.preferredLanguages = value;
                try {
                  await ObjectStore.set(
                    "weebdex_preferred_languages",
                    value
                  );
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

  // --- PageLinkResolver ---
  async resolvePageSection(
    _link: PageLink,
    _sectionID: string
  ): Promise<ResolvedPageSection> {
    throw new Error("Method not implemented.");
  }

  async getSectionsForPage(_link: PageLink): Promise<PageSection[]> {
    await this.ensurePrefs();
    try {
      const sections: PageSection[] = [];

      // Use official top manga endpoint
      try {
        const response = await getTopManga(this.client, "views", "7d", 1, 20);
        if (response && response.data && response.data.length > 0) {
          const visible = this.hidePornographic
            ? response.data.filter((m) => m.content_rating !== "pornographic")
            : response.data;
          sections.push({
            id: "most_viewed",
            title: "Most Viewed (7 Days)",
            style: SectionStyle.GALLERY,
            items: mangaListToHighlights(visible),
          });
        }
      } catch (topError) {
        console.error("Top manga endpoint failed:", topError);
      }

      // Also expose latest updates for discovery
      try {
        const feed = await getLatestFeed(this.client, 1, 100);
        if (feed?.data?.length > 0) {
          const seen = new Set<string>();
          const items: Highlight[] = [];
          const TARGET = 20;

          for (const chapter of feed.data) {
            const relationshipManga = chapter.relationships?.manga;
            const mangaId = relationshipManga?.id;
            if (!mangaId || seen.has(mangaId)) {
              continue;
            }
            seen.add(mangaId);

            const mappedManga = feed.map?.manga?.[mangaId];
            const manga = mappedManga ?? relationshipManga;
            if (
              this.hidePornographic &&
              manga?.content_rating === "pornographic"
            ) {
              continue;
            }
            const coverRel = manga?.relationships?.cover;

            let cover = "/assets/weebdex_logo.png";
            if (coverRel?.id) {
              cover = proxifyImage(
                getCoverUrl(mangaId, coverRel.id, coverRel.ext || "jpg", "256")
              );
            }

            const chapterLabel = formatChapterNumber(
              chapter.chapter,
              chapter.volume
            );
            const subtitle = chapter.title
              ? `${chapterLabel} - ${chapter.title}`
              : chapterLabel;
            const isNSFW = manga?.content_rating === "pornographic";

            items.push({
              id: buildMangaId(mangaId),
              title: manga?.title || "Unknown Manga",
              cover,
              subtitle: isNSFW ? `${subtitle} • NSFW` : subtitle,
              isNSFW: isNSFW || undefined,
            } as any);
            if (items.length >= TARGET) break;
          }

          if (items.length > 0) {
          sections.push({
            id: "latest_updates",
            title: "Latest Updates",
            style: SectionStyle.STANDARD_GRID,
            items,
          });
          }
        }
      } catch (feedError) {
        console.error("Latest feed endpoint failed:", feedError);
      }

      if (sections.length > 0) {
        return sections;
      }

      // Fallback: use search browse if top/feed are empty
      const searchResponse = await searchManga("", this.client, 1, 20);
      if (searchResponse?.data?.length > 0) {
        const visible = this.hidePornographic
          ? searchResponse.data.filter((m) => m.content_rating !== "pornographic")
          : searchResponse.data;
        return [
          {
            id: "popular",
            title: "Popular Manga",
            style: SectionStyle.STANDARD_GRID,
            items: mangaListToHighlights(visible),
          },
        ];
      }

      throw new Error("No data available");
    } catch (error: any) {
      if (error?.name === "CloudflareError") throw error;
      console.error("Failed to load home sections:", error);
      return [
        {
          id: "info",
          title: "WeebDex",
          style: SectionStyle.PADDED_LIST,
          items: [
            {
              id: "info",
              title: "WeebDex",
              subtitle: "Search for manga using the search bar",
              cover: "/assets/weebdex_logo.png",
            },
          ],
        },
      ];
    }
  }

  // --- ContentSource ---
  async getContent(contentId: string): Promise<Content> {
    await this.ensurePrefs();
    try {
      const { id } = parseMangaId(contentId);
      const manga = await getMangaById(id, this.client);
      if (this.hidePornographic && manga.content_rating === "pornographic") {
        throw new Error(
          "This title is hidden by your NSFW preference. Disable 'Hide NSFW Titles' to view it."
        );
      }
      let recommendations: any[] | undefined;
      try {
        const recResponse = await getRecommendations(id, this.client);
        if (recResponse?.data?.length > 0) {
          recommendations = recResponse.data;
        }
      } catch {
        // Recommendations are non-critical
      }
      return mangaToContent(manga, recommendations, {
        hideNSFW: this.hidePornographic,
      });
    } catch (error: any) {
      if (error?.name === "CloudflareError") throw error;
      console.error(`Failed to get content ${contentId}:`, error);
      throw new Error(`Failed to load manga: ${error}`);
    }
  }

  async getChapters(contentId: string): Promise<Chapter[]> {
    await this.ensurePrefs();
    try {
      const { id } = parseMangaId(contentId);
      let chapters = await getAllChapters(id, this.client, this.preferredLanguages.length > 0 ? this.preferredLanguages : undefined);

      if (!chapters || chapters.length === 0) {
        return [];
      }

      // Client-side language filter as safety net (API fallback may drop tlang)
      if (this.preferredLanguages.length > 0) {
        const allowedLangs = new Set(this.preferredLanguages);
        chapters = chapters.filter((ch) => allowedLangs.has(ch.language));
      }

      // Convert to Suwatte chapters with single pass through chapters
      const suwatteChapters: Chapter[] = chapters.map((chapter, index) => {
        const chapterNum = chapter.chapter ? parseFloat(chapter.chapter) : 0;
        const volumeNum = chapter.volume
          ? parseFloat(chapter.volume)
          : undefined;
        const groups = chapter.relationships?.groups || [];

        // Build title efficiently
        let title = chapter.title;
        if (!title) {
          const parts: string[] = [];
          if (chapter.volume) parts.push(`Vol. ${chapter.volume}`);
          if (chapter.chapter) parts.push(`Ch. ${chapter.chapter}`);
          title = parts.length > 0 ? parts.join(" ") : "Chapter";
        }

        return {
          chapterId: chapter.id,
          number: isNaN(chapterNum) ? 0 : chapterNum,
          volume: isNaN(volumeNum || 0) ? undefined : volumeNum,
          title,
          language: chapter.language,
          date: new Date(chapter.published_at),
          index,
          providers:
            groups.length > 0
              ? groups.map((g) => ({ id: g.id, name: g.name }))
              : undefined,
        };
      });

      // Single sort pass with efficient comparator
      suwatteChapters.sort((a, b) => {
        if (a.volume === undefined && b.volume !== undefined) return -1;
        if (a.volume !== undefined && b.volume === undefined) return 1;
        if (a.volume !== b.volume) return (b.volume || 0) - (a.volume || 0);
        if (a.number !== b.number) return b.number - a.number;
        // Same number: oldest first so new uploads don't trigger false update notifications
        return a.date.getTime() - b.date.getTime();
      });

      // Update indices after sorting
      suwatteChapters.forEach((ch, i) => {
        ch.index = i;
      });

      return suwatteChapters;
    } catch (error) {
      console.error(
        `getChapters error for ${contentId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  async getChapterData(
    _contentId: string,
    chapterId: string
  ): Promise<ChapterData> {
    try {
      // The chapterId passed in is just the raw chapter ID from WeebDex
      return await getChapterData(chapterId, this.client, false);
    } catch (error) {
      console.error(`Failed to get chapter data for ${chapterId}:`, error);
      throw new Error(`Failed to load chapter pages: ${error}`);
    }
  }

  async getDirectory(request: DirectoryRequest): Promise<PagedResult> {
    await this.ensurePrefs();
    const query = request.query?.trim() || "";
    const page = request.page || 1;
    const limit = 20;
    const filters = request.filters ?? {};

    const tagFilter =
      filters.tags &&
      typeof filters.tags === "object" &&
      !Array.isArray(filters.tags)
        ? (filters.tags as { included?: string[]; excluded?: string[] })
        : undefined;

    const yearFromRaw = filters.year_from;
    const yearToRaw = filters.year_to;
    const yearFrom =
      typeof yearFromRaw === "string" && yearFromRaw.trim() !== ""
        ? parseInt(yearFromRaw, 10)
        : undefined;
    const yearTo =
      typeof yearToRaw === "string" && yearToRaw.trim() !== ""
        ? parseInt(yearToRaw, 10)
        : undefined;

    const searchFilters = {
      sort: typeof filters.sort === "string" ? filters.sort : undefined,
      order:
        filters.order === "asc" || filters.order === "desc"
          ? (filters.order as "asc" | "desc")
          : undefined,
      demographic:
        typeof filters.demographic === "string" ? filters.demographic : undefined,
      status: typeof filters.status === "string" ? filters.status : undefined,
      contentRating:
        typeof filters.content_rating === "string"
          ? [filters.content_rating]
          : DEFAULT_CONTENT_RATINGS,
      availableTranslatedLang:
        typeof filters.language === "string" ? [filters.language] : undefined,
      yearFrom: typeof yearFrom === "number" && !isNaN(yearFrom) ? yearFrom : undefined,
      yearTo: typeof yearTo === "number" && !isNaN(yearTo) ? yearTo : undefined,
      tag: tagFilter?.included?.length ? tagFilter.included : undefined,
      tagx: tagFilter?.excluded?.length ? tagFilter.excluded : undefined,
      tmod:
        filters.tag_include_mode === "OR" ? "OR" : ("AND" as "AND" | "OR"),
      txmod:
        filters.tag_exclude_mode === "AND" ? "AND" : ("OR" as "AND" | "OR"),
      hasChapters: true,
    };

    // If no query, show popular manga via search
    if (!query) {
      try {
        const hasActiveFilters = Object.values(filters).some((value) => {
          if (value === undefined || value === null) return false;
          if (typeof value === "string") return value.trim().length > 0;
          if (Array.isArray(value)) return value.length > 0;
          if (typeof value === "object") return Object.keys(value).length > 0;
          return true;
        });

        // If filters are applied, use search endpoint so filter criteria are respected.
        if (hasActiveFilters) {
          const filtered = await searchManga("", this.client, page, limit, searchFilters);
          const visible = this.hidePornographic
            ? filtered.data.filter((m) => m.content_rating !== "pornographic")
            : filtered.data;
          return {
            results: mangaListToHighlights(visible),
            isLastPage: filtered.data.length < limit || page * limit >= filtered.total,
          };
        }

        // Try top manga first for clean browse
        try {
          const response = await getTopManga(
            this.client,
            "views",
            "7d",
            page,
            limit
          );
          if (response && response.data && response.data.length > 0) {
            const visible = this.hidePornographic
              ? response.data.filter((m) => m.content_rating !== "pornographic")
              : response.data;
            const highlights = mangaListToHighlights(visible);
            return {
              results: highlights,
              isLastPage: response.data.length < limit,
            };
          }
        } catch {
          // Continue to fallback
        }

        // Fallback: search with sort by relevance
        const response = await searchManga("", this.client, page, limit, searchFilters);
        if (response && response.data && response.data.length > 0) {
          const visible = this.hidePornographic
            ? response.data.filter((m) => m.content_rating !== "pornographic")
            : response.data;
          const highlights = mangaListToHighlights(visible);
          return {
            results: highlights,
            isLastPage:
              response.data.length < limit || page * limit >= response.total,
          };
        }

        throw new Error("No data");
      } catch (error) {
        console.error("Failed to load browse:", error);
        return {
          results: [
            {
              id: "error",
              title: "Failed to load content",
              subtitle: "Please try again later",
              cover: "/assets/weebdex_logo.png",
            },
          ],
          isLastPage: true,
        };
      }
    }

    // Search for manga
    try {
      const response = await searchManga(query, this.client, page, limit, searchFilters);

      if (!response || !response.data || response.data.length === 0) {
        return {
          results: [
            {
              id: "no_results",
              title: "No results found",
              subtitle: `No manga found for "${query}"`,
              cover: "/assets/weebdex_logo.png",
            },
          ],
          isLastPage: true,
        };
      }

      const visible = this.hidePornographic
        ? response.data.filter((m) => m.content_rating !== "pornographic")
        : response.data;
      const highlights = mangaListToHighlights(visible);
      const isLastPage =
        response.data.length < limit || page * limit >= response.total;

      return {
        results: highlights,
        isLastPage,
      };
    } catch (error: any) {
      if (error?.name === "CloudflareError") throw error;
      console.error("Search failed:", error);
      return {
        results: [
          {
            id: "error",
            title: "Search failed",
            subtitle: "Please try again later",
            cover: "/assets/weebdex_logo.png",
          },
        ],
        isLastPage: true,
      };
    }
  }

  async getDirectoryConfig(): Promise<DirectoryConfig> {
    if (!this.tagFilterOptions) {
      try {
        const tags = await getTagList(this.client, 1, 100);
        this.tagFilterOptions = tags.data
          .map((tag) => ({
            id: tag.id,
            title: tag.name,
          }))
          .sort((a, b) => a.title.localeCompare(b.title));
      } catch (error) {
        console.error("Failed to load tag filters:", error);
        this.tagFilterOptions = [];
      }
    }

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
          id: "order",
          title: "Sort Order",
          options: SORT_ORDER_OPTIONS.map(([title, id]) => ({ id, title })),
        },
        {
          type: FilterType.SELECT,
          id: "status",
          title: "Publication Status",
          options: Object.entries(PUBLICATION_STATUS).map(([id, title]) => ({
            id,
            title,
          })),
        },
        {
          type: FilterType.SELECT,
          id: "demographic",
          title: "Demographic",
          options: Object.entries(DEMOGRAPHICS).map(([id, title]) => ({
            id,
            title,
          })),
        },
        {
          type: FilterType.SELECT,
          id: "content_rating",
          title: "Content Rating",
          options: Object.entries(CONTENT_RATINGS).map(([id, title]) => ({
            id,
            title,
          })),
        },
        {
          type: FilterType.SELECT,
          id: "language",
          title: "Original Language",
          options: LANGUAGE_OPTIONS.map(([title, id]) => ({ id, title })),
        },
        {
          type: FilterType.TEXT,
          id: "year_from",
          title: "Year From",
        },
        {
          type: FilterType.TEXT,
          id: "year_to",
          title: "Year To",
        },
        {
          type: FilterType.EXCLUDABLE_MULTISELECT,
          id: "tags",
          title: "Tags",
          options: this.tagFilterOptions,
        },
        {
          type: FilterType.SELECT,
          id: "tag_include_mode",
          title: "Tag Include Mode",
          options: TAG_MODE_OPTIONS.map(([title, id]) => ({ id, title })),
        },
        {
          type: FilterType.SELECT,
          id: "tag_exclude_mode",
          title: "Tag Exclude Mode",
          options: TAG_MODE_OPTIONS.map(([title, id]) => ({ id, title })),
        },
      ],
    };
  }

  // --- ImageRequestHandler ---
  async willRequestImage(url: string): Promise<NetworkRequest> {
    // Add required headers for WeebDex images
    return {
      url,
      headers: {
        ...REQUIRED_HEADERS,
      },
    };
  }
}
