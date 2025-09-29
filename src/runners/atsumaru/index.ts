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
  PageLink,
  PageLinkResolver,
  PagedResult,
  PageSection,
  ResolvedPageSection,
  SectionStyle,
  Property,
} from "@suwatte/daisuke";
import { INFO } from "./constants";
import {
  buildSeriesId,
  parseSeriesId,
  extractHomeSectionsFromPrefetch,
  getSeriesById,
  getChapterData,
  searchManga,
} from "./parser";
import {
  fetchText,
  pageLinkToString,
  SimpleNetworkClient,
  fetchDoc,
  proxifyImage,
} from "./helpers";
import { JSONSchema } from "./types";

export class Target
  implements ContentSource, ImageRequestHandler, PageLinkResolver
{
  info = INFO;
  private client: SimpleNetworkClient = new NetworkClient();

  private fetcher = (url: string) => fetchText(url, this.client);

  // --- PageLinkResolver ---
  async resolvePageSection(
    _link: PageLink,
    _sectionID: string,
  ): Promise<ResolvedPageSection> {
    throw new Error("Method not used.");
  }

  private instructionsSection(): PageSection {
    return {
      id: "atsu_instructions",
      title: "Atsumaru",
      style: SectionStyle.PADDED_LIST,
      items: [
        {
          id: "info",
          title: "Browse atsu.moe",
          subtitle: "Scroll for latest/popular from the homepage.",
          cover: "/assets/cubari_logo.png",
        },
      ],
    };
  }

  async getSectionsForPage(_link: PageLink): Promise<PageSection[]> {
    const base = "https://atsu.moe/";
    const apiUrl = "https://atsu.moe/api/home/page";

    try {
      const apiResponse = await this.fetcher(apiUrl);
      return extractHomeSectionsFromPrefetch(apiResponse, base);
    } catch {
      return [this.instructionsSection()];
    }
  }

  // --- ContentSource ---
  async getContent(contentId: string): Promise<Content> {
    const { slug } = parseSeriesId(contentId);

    // Get content using the detailed API
    const content = await getSeriesById(slug, this.client);
    if (content) {
      return content;
    }

    // Fallback
    return {
      title: "Atsumaru Series",
      cover: "/assets/cubari_logo.png",
      summary: undefined,
      creators: undefined,
      properties: [],
    };
  }

  async getChapters(contentId: string): Promise<Chapter[]> {
    return [];
  }

  async getChapterData(
    contentId: string,
    chapterId: string,
  ): Promise<ChapterData> {
    const { slug } = parseSeriesId(contentId);
    const chapterData = await getChapterData(slug, chapterId, this.client);

    if (!chapterData) {
      throw new Error(`Failed to fetch chapter data for ${chapterId}`);
    }

    return {
      pages: chapterData.pages.map((page: any) => ({
        url: `https://atsu.moe${page.image}`,
        width: page.width,
        height: page.height,
      })),
    } as ChapterData;
  }

  // Removed getTags method to hide filter interface
  // The filter interface won't appear since this method doesn't exist

  async getDirectory(query: DirectoryRequest): Promise<PagedResult> {
    const q = (query.query ?? "").trim();
    if (!q) {
      return {
        results: [
          {
            id: "atsu_instructions",
            title: "Search Atsumaru manga",
            cover: "/assets/cubari_logo.png",
            subtitle: "Type a manga name to search",
          },
        ],
        isLastPage: true,
      };
    }

    // Direct link resolution removed; rely solely on the search API

    // Otherwise, use search API
    try {
      const searchResults = await searchManga(q, this.client);
      if (searchResults && searchResults.hits.length > 0) {
        const results: Highlight[] = searchResults.hits.map(hit => {
          const doc = hit.document;
          return {
            id: buildSeriesId(doc.id),
            title: doc.englishTitle || doc.title,
            cover: doc.poster ? proxifyImage(`https://atsu.moe${doc.poster}`) : "/assets/cubari_logo.png",
            subtitle: hit.highlight.title.snippet.replace(/<[^>]*>/g, '').trim(),
          } as Highlight;
        });

        return {
          results,
          isLastPage: results.length < 20,
        };
      }
    } catch (error) {
      // Search failed, continue to fallback
    }

    // Final fallback
    const item: Highlight = {
      id: "atsu_no_results",
      title: "No results found",
      cover: "/assets/cubari_logo.png",
      subtitle: `No manga found for "${q}"`,
    };
    return { results: [item], isLastPage: true };
  }

  async getDirectoryConfig(): Promise<DirectoryConfig> {
    return { filters: [] };
  }

  // --- ImageRequestHandler ---
  async willRequestImage(url: string): Promise<NetworkRequest> {
    return { url, headers: { Referer: "https://atsu.moe/" } };
  }
}
