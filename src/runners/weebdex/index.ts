import {
  Chapter,
  ChapterData,
  Content,
  ContentSource,
  DirectoryConfig,
  DirectoryRequest,
  Highlight,
  ImageRequestHandler,
  NetworkRequest,
  PagedResult,
  PageLink,
  PageLinkResolver,
  PageSection,
  ResolvedPageSection,
  SectionStyle,
} from "@suwatte/daisuke";
import {
  BASE_URL,
  CONTENT_RATINGS,
  DEFAULT_CONTENT_RATINGS,
  DEMOGRAPHICS,
  INFO,
  PUBLICATION_STATUS,
  REQUIRED_HEADERS,
  SITE_URL,
} from "./constants";
import {
  buildMangaId,
  parseChapterId,
  parseMangaId,
  SimpleNetworkClient,
} from "./helpers";
import {
  chapterListToHighlights,
  getAllChapters,
  getChapterData,
  getLatestFeed,
  getMangaById,
  getTopManga,
  mangaListToHighlights,
  mangaToContent,
  searchManga,
} from "./parser";

export class Target
  implements ContentSource, ImageRequestHandler, PageLinkResolver
{
  info = INFO;
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
      // Try to get most viewed manga, fall back to search if it fails
      try {
        const response = await getTopManga(this.client, "views", "7d", 1, 20);
        if (response && response.data && response.data.length > 0) {
          const highlights = mangaListToHighlights(response.data);
          return [
            {
              id: "most_viewed",
              title: "Most Viewed (7 Days)",
              style: SectionStyle.STANDARD_GRID,
              items: highlights,
            },
          ];
        }
      } catch (topError) {
        console.error(
          "Top manga endpoint failed, trying alternative:",
          topError
        );
      }

      // Fallback: Use search with empty query to get popular manga
      const searchResponse = await searchManga("", this.client, 1, 20);
      if (
        searchResponse &&
        searchResponse.data &&
        searchResponse.data.length > 0
      ) {
        const highlights = mangaListToHighlights(searchResponse.data);
        return [
          {
            id: "popular",
            title: "Popular Manga",
            style: SectionStyle.STANDARD_GRID,
            items: highlights,
          },
        ];
      }

      throw new Error("No data available");
    } catch (error) {
      console.error("Failed to load home sections:", error);
      return [
        {
          id: "info",
          title: "WeebDex",
          style: SectionStyle.PADDED_LIST,
          items: [
            {
              id: "info",
              title: "WeebDex - Manga Reader",
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
    try {
      const { id } = parseMangaId(contentId);
      const manga = await getMangaById(id, this.client);
      return mangaToContent(manga);
    } catch (error) {
      console.error(`Failed to get content ${contentId}:`, error);
      throw new Error(`Failed to load manga: ${error}`);
    }
  }

  async getChapters(contentId: string): Promise<Chapter[]> {
    try {
      const { id } = parseMangaId(contentId);
      const chapters = await getAllChapters(id, this.client);

      if (!chapters || chapters.length === 0) {
        return [];
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
    const query = request.query?.trim() || "";
    const page = request.page || 1;
    const limit = 20;

    // If no query, show popular manga via search
    if (!query) {
      try {
        // Try top manga first
        try {
          const response = await getTopManga(
            this.client,
            "views",
            "7d",
            page,
            limit
          );
          if (response && response.data && response.data.length > 0) {
            const highlights = mangaListToHighlights(response.data);
            return {
              results: highlights,
              isLastPage: response.data.length < limit,
            };
          }
        } catch {
          // Continue to fallback
        }

        // Fallback: search with sort by relevance
        const response = await searchManga("a", this.client, page, limit);
        if (response && response.data && response.data.length > 0) {
          const highlights = mangaListToHighlights(response.data);
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
      const response = await searchManga(query, this.client, page, limit);

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

      const highlights = mangaListToHighlights(response.data);
      const isLastPage =
        response.data.length < limit || page * limit >= response.total;

      return {
        results: highlights,
        isLastPage,
      };
    } catch (error) {
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
    // Simple config without filters for now
    return { filters: [] };
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
