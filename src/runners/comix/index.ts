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
import { BASE_URL, INFO } from "./constants";
import { NetworkClient, parseMangaId, SimpleNetworkClient } from "./helpers";
import {
  getAllChapters,
  getChapterData,
  getLatestManga,
  getMangaById,
  getPopularManga,
  mangaListToHighlights,
  searchManga,
} from "./parser";

export class Target
  implements ContentSource, ImageRequestHandler, PageLinkResolver, RunnerPreferenceProvider
{
  info = INFO;
  private client: SimpleNetworkClient = new NetworkClient();
  private hideNSFW: boolean = false;
  private dedupChapters: boolean = false;

  constructor() {
    this.initializePreferences();
  }

  private async initializePreferences(): Promise<void> {
    try {
      const stored = await ObjectStore.boolean("comix_hide_nsfw");
      if (stored !== null) {
        this.hideNSFW = stored;
      }
      const dedupStored = await ObjectStore.boolean("comix_dedup_chapters");
      if (dedupStored !== null) {
        this.dedupChapters = dedupStored;
      }
    } catch (error) {
      console.error("Failed to load preference:", error);
    }
  }

  // --- PageLinkResolver ---
  async resolvePageSection(
    _link: PageLink,
    _sectionID: string
  ): Promise<ResolvedPageSection> {
    throw new Error("Method not implemented.");
  }

  async getSectionsForPage(_link: PageLink): Promise<PageSection[]> {
    try {
      // Fetch popular and latest updates in parallel for the homepage
      const [popularSettled, latestSettled] = await Promise.allSettled([
        getPopularManga(this.client, 1),
        getLatestManga(this.client, 1),
      ]);

      const sections: PageSection[] = [];

      // Popular section (30 days)
      if (
        popularSettled.status === "fulfilled" &&
        popularSettled.value?.result?.items &&
        popularSettled.value.result.items.length > 0
      ) {
        let popularItems = popularSettled.value.result.items;
        if (this.hideNSFW) {
          popularItems = popularItems.filter((manga) => !manga.is_nsfw);
        }
        const popularHighlights = mangaListToHighlights(popularItems);
        sections.push({
          id: "popular",
          title: "Popular (30 Days)",
          style: SectionStyle.GALLERY,
          items: popularHighlights.slice(0, 20),
        });
      }

      // Latest updates section
      if (
        latestSettled.status === "fulfilled" &&
        latestSettled.value?.result?.items &&
        latestSettled.value.result.items.length > 0
      ) {
        let latestItems = latestSettled.value.result.items;
        if (this.hideNSFW) {
          latestItems = latestItems.filter((manga) => !manga.is_nsfw);
        }
        const latestHighlights = mangaListToHighlights(latestItems);
        sections.push({
          id: "latest",
          title: "Latest Updates",
          style: SectionStyle.STANDARD_GRID,
          items: latestHighlights.slice(0, 20),
        });
      }

      // If we were able to build at least one section, return them
      if (sections.length > 0) {
        return sections;
      }

      // Fallback if no sections could be built
      return [
        {
          id: "info",
          title: "Comix",
          style: SectionStyle.PADDED_LIST,
          items: [
            {
              id: "info",
              title: "Comix - Manga Reader",
              subtitle: "Search for manga using the search bar",
              cover: "/assets/comix_logo.png",
            },
          ],
        },
      ];
    } catch (error) {
      if (error instanceof Error) {
        console.error("getSectionsForPage: Failed to load home sections:", error.message);
        console.error(error.stack);
      } else {
        try {
          console.error("getSectionsForPage: Failed to load home sections:", JSON.stringify(error));
        } catch {
          console.error("getSectionsForPage: Failed to load home sections: (unserializable error)");
        }
      }
      return [
        {
          id: "info",
          title: "Comix",
          style: SectionStyle.PADDED_LIST,
          items: [
            {
              id: "info",
              title: "Comix - Manga Reader",
              subtitle: "Search for manga using the search bar",
              cover: "/assets/comix_logo.png",
            },
          ],
        },
      ];
    }
  }

  // --- ContentSource ---
  async getContent(contentId: string): Promise<Content> {
    try {
      const { hashId } = parseMangaId(contentId);
      const content = await getMangaById(hashId, this.client);
      return content;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to get content ${contentId}:`, error.message);
        console.error(error.stack);
      } else {
        try {
          console.error(`Failed to get content ${contentId}:`, JSON.stringify(error));
        } catch {
          console.error(`Failed to get content ${contentId}: (unserializable error)`);
        }
      }
      throw new Error(`Failed to load manga: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getChapters(contentId: string): Promise<Chapter[]> {
    try {
      const { hashId } = parseMangaId(contentId);
      const chapters = await getAllChapters(hashId, this.client, this.dedupChapters);
      return chapters;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to get chapters for ${contentId}:`, error.message);
        console.error(error.stack);
      } else {
        try {
          console.error(`Failed to get chapters for ${contentId}:`, JSON.stringify(error));
        } catch {
          console.error(`Failed to get chapters for ${contentId}: (unserializable error)`);
        }
      }
      // Return empty array instead of throwing to allow the app to continue
      return [];
    }
  }

  async getChapterData(
    _contentId: string,
    chapterId: string
  ): Promise<ChapterData> {
    try {
      return await getChapterData(chapterId, this.client);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to get chapter data for ${chapterId}:`, error.message);
        console.error(error.stack);
      } else {
        try {
          console.error(`Failed to get chapter data for ${chapterId}:`, JSON.stringify(error));
        } catch {
          console.error(`Failed to get chapter data for ${chapterId}: (unserializable error)`);
        }
      }
      throw new Error(`Failed to load chapter pages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getDirectory(request: DirectoryRequest): Promise<PagedResult> {
    const query = request.query?.trim() || "";
    const page = request.page || 1;

    // If no query, show popular manga or filtered browse
    if (!query) {
      try {
        // Check if any filters are applied
        const hasFilters = request.filters && Object.keys(request.filters).some(key => {
          const val = request.filters![key];
          if (Array.isArray(val)) return val.length > 0;
          return val && val !== "";
        });

        let response;
        if (hasFilters) {
          // Use search with filters (use space to enable filtering)
          response = await searchManga(" ", this.client, page, request.filters);
        } else {
          // Use popular manga
          response = await getPopularManga(this.client, page);
        }

        if (response?.result?.items && response.result.items.length > 0) {
          // Filter out NSFW content if hide_nsfw is enabled
          let filteredItems = response.result.items;
          if (this.hideNSFW) {
            filteredItems = response.result.items.filter(manga => !manga.is_nsfw);
          }

          const highlights = mangaListToHighlights(filteredItems);
          const isLastPage =
            response.result.pagination.current_page >= response.result.pagination.last_page;

          return {
            results: highlights,
            isLastPage,
          };
        }

        throw new Error("No data");
      } catch (error) {
        if (error instanceof Error) {
          console.error("getDirectory: Failed to load browse:", error.message);
          console.error(error.stack);
        } else {
          try {
            console.error("getDirectory: Failed to load browse:", JSON.stringify(error));
          } catch {
            console.error("getDirectory: Failed to load browse: (unserializable error)");
          }
        }
        return {
          results: [
            {
              id: "error",
              title: "Failed to load content",
              subtitle: "Please try again later",
              cover: "/assets/comix_logo.png",
            },
          ],
          isLastPage: true,
        };
      }
    }

    // Search for manga
    try {
      const response = await searchManga(query, this.client, page, request.filters);
      
      if (!response?.result?.items || response.result.items.length === 0) {
        return {
          results: [
            {
              id: "no_results",
              title: "No results found",
              subtitle: `No manga found for "${query}"`,
              cover: "/assets/comix_logo.png",
            },
          ],
          isLastPage: true,
        };
      }

      // Filter out NSFW content if hide_nsfw is enabled
      let filteredItems = response.result.items;
      if (this.hideNSFW) {
        filteredItems = response.result.items.filter(manga => !manga.is_nsfw);
      }

      const highlights = mangaListToHighlights(filteredItems);
      const isLastPage =
        response.result.pagination.current_page >= response.result.pagination.last_page;

      return {
        results: highlights,
        isLastPage,
      };
    } catch (error) {
      if (error instanceof Error) {
        console.error("Search failed:", error.message);
        console.error(error.stack);
      } else {
        try {
          console.error("Search failed:", JSON.stringify(error));
        } catch {
          console.error("Search failed: (unserializable error)");
        }
      }
      return {
        results: [
          {
            id: "error",
            title: "Search failed",
            subtitle: "Please try again later",
            cover: "/assets/comix_logo.png",
          },
        ],
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
          options: [
            { id: "relevance", title: "Best Match" },
            { id: "views_30d", title: "Popular (30 days)" },
            { id: "chapter_updated_at", title: "Latest Updates" },
            { id: "created_at", title: "Recently Added" },
            { id: "title", title: "Title (A-Z)" },
            { id: "year", title: "Year (Newest)" },
            { id: "total_views", title: "Total Views" },
          ],
        },
        {
          type: FilterType.MULTISELECT,
          id: "status",
          title: "Status",
          options: [
            { id: "releasing", title: "Releasing" },
            { id: "on_hiatus", title: "On Hiatus" },
            { id: "finished", title: "Finished" },
            { id: "discontinued", title: "Discontinued" },
            { id: "not_yet_released", title: "Not Yet Released" },
          ],
        },
        {
          type: FilterType.MULTISELECT,
          id: "type",
          title: "Type",
          options: [
            { id: "manga", title: "Manga" },
            { id: "manhwa", title: "Manhwa" },
            { id: "manhua", title: "Manhua" },
            { id: "other", title: "Other" },
          ],
        },
        {
          type: FilterType.MULTISELECT,
          id: "demographic",
          title: "Demographic",
          options: [
            { id: "1", title: "Shoujo" },
            { id: "2", title: "Shounen" },
            { id: "3", title: "Josei" },
            { id: "4", title: "Seinen" },
          ],
        },
        {
          type: FilterType.MULTISELECT,
          id: "genres",
          title: "Genres",
          options: [
            { id: "6", title: "Action" },
            { id: "7", title: "Adventure" },
            { id: "8", title: "Boys Love" },
            { id: "9", title: "Comedy" },
            { id: "10", title: "Crime" },
            { id: "11", title: "Drama" },
            { id: "12", title: "Fantasy" },
            { id: "13", title: "Girls Love" },
            { id: "14", title: "Historical" },
            { id: "15", title: "Horror" },
            { id: "16", title: "Isekai" },
            { id: "17", title: "Magical Girls" },
            { id: "18", title: "Mecha" },
            { id: "19", title: "Medical" },
            { id: "20", title: "Mystery" },
            { id: "21", title: "Philosophical" },
            { id: "22", title: "Psychological" },
            { id: "23", title: "Romance" },
            { id: "24", title: "Sci-Fi" },
            { id: "25", title: "Slice of Life" },
            { id: "26", title: "Sports" },
            { id: "27", title: "Superhero" },
            { id: "28", title: "Thriller" },
            { id: "29", title: "Tragedy" },
            { id: "30", title: "Wuxia" },
            { id: "31", title: "Aliens" },
            { id: "32", title: "Animals" },
            { id: "33", title: "Cooking" },
            { id: "34", title: "Cross Dressing" },
            { id: "35", title: "Delinquents" },
            { id: "36", title: "Demons" },
            { id: "37", title: "Genderswap" },
            { id: "38", title: "Ghosts" },
            { id: "39", title: "Gyaru" },
            { id: "40", title: "Harem" },
            { id: "41", title: "Incest" },
            { id: "42", title: "Loli" },
            { id: "43", title: "Mafia" },
            { id: "44", title: "Magic" },
            { id: "45", title: "Martial Arts" },
            { id: "46", title: "Military" },
            { id: "47", title: "Monster Girls" },
            { id: "48", title: "Monsters" },
            { id: "49", title: "Music" },
            { id: "50", title: "Ninja" },
            { id: "51", title: "Office Workers" },
            { id: "52", title: "Police" },
            { id: "53", title: "Post-Apocalyptic" },
            { id: "54", title: "Reincarnation" },
            { id: "55", title: "Reverse Harem" },
            { id: "56", title: "Samurai" },
            { id: "57", title: "School Life" },
            { id: "58", title: "Shota" },
            { id: "59", title: "Supernatural" },
            { id: "60", title: "Survival" },
            { id: "61", title: "Time Travel" },
            { id: "62", title: "Traditional Games" },
            { id: "63", title: "Vampires" },
            { id: "64", title: "Video Games" },
            { id: "65", title: "Villainess" },
            { id: "66", title: "Virtual Reality" },
            { id: "67", title: "Zombies" },
          ],
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
          type: FilterType.TEXT,
          id: "min_chapters",
          title: "Minimum Chapters",
        },
      ],
    };
  }

  // --- ImageRequestHandler ---
  async willRequestImage(url: string): Promise<NetworkRequest> {
    // Add required headers for Comix images
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
          children: [
            UIToggle({
              id: "hide_nsfw",
              title: "Hide NSFW Content",
              value: this.hideNSFW,
              didChange: async (value: boolean) => {
                this.hideNSFW = value;
                try {
                  await ObjectStore.set("comix_hide_nsfw", value);
                } catch (error) {
                  console.error("Failed to save preference:", error);
                }
              },
            }),
            UIToggle({
              id: "dedup_chapters",
              title: "Deduplicate Chapters",
              value: this.dedupChapters,
              didChange: async (value: boolean) => {
                this.dedupChapters = value;
                try {
                  await ObjectStore.set("comix_dedup_chapters", value);
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