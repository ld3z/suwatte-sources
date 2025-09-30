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
  SimpleNetworkClient,
  proxifyImage,
} from "./helpers";

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
      let page = Math.max(1, Number((query as any).page ?? 1));

      // Allow larger pages; default to 24, cap to a safe upper bound
      const perPageRaw =
        (query as any).pageSize ??
        (query as any).limit ??
        (query as any).perPage ??
        24;
      const perPage = Math.max(12, Math.min(48, Number(perPageRaw) || 24));

      

      let searchResults = await searchManga(q, this.client, page, perPage);

      // If requested page > 1 and the API returns no hits, fallback to page 1 to avoid an empty screen
      if ((!searchResults || !Array.isArray((searchResults as any).hits) || (searchResults as any).hits.length === 0) && page > 1) {
        
        const retry = await searchManga(q, this.client, 1, perPage);
        if (retry && Array.isArray((retry as any).hits) && (retry as any).hits.length > 0) {
          page = 1; // normalize for isLastPage calc and logs
          searchResults = retry as any;
        }
      }

      if (searchResults && Array.isArray(searchResults.hits) && searchResults.hits.length > 0) {
        const qLower = q.toLowerCase();

        // Stable-ish ordering: exact matches first, then by server ranking (text_match), then stable index
        const scored = searchResults.hits.map((h: any, idx: number) => {
          const d = h?.document || {};
          const tEn = String(d.englishTitle || "").toLowerCase();
          const t = String(d.title || "").toLowerCase();
          const exactScore = tEn === qLower ? 2 : t === qLower ? 1 : 0;
          const rank = Number(h?.text_match ?? 0);
          return { h, idx, exactScore, rank };
        });

        scored.sort((a, b) => {
          if (b.exactScore !== a.exactScore) return b.exactScore - a.exactScore;
          if (b.rank !== a.rank) return b.rank - a.rank;
          return a.idx - b.idx;
        });

        const results: Highlight[] = scored.map(({ h }) => {
          const doc = h.document || {};
          const hl: any = h.highlight || {};
          const hlList: any[] = Array.isArray(h.highlights) ? h.highlights : [];

          // Prefer field-specific highlight; fall back to any available snippet
          const rawSnippet =
            (hl.title && hl.title.snippet) ??
            (hl.englishTitle && hl.englishTitle.snippet) ??
            (hlList.find(x => x?.field === "title")?.snippet) ??
            (hlList.find(x => x?.field === "englishTitle")?.snippet) ??
            "";

          const cleanSnippet = String(rawSnippet).replace(/<[^>]*>/g, "").trim();

          return {
            id: buildSeriesId(doc.id),
            title: doc.englishTitle || doc.title,
            cover: doc.poster ? proxifyImage(`https://atsu.moe${doc.poster}`) : "/assets/cubari_logo.png",
            subtitle: cleanSnippet || undefined,
          } as Highlight;
        });

        // Use 'found' (total hits for this query) instead of 'out_of' (collection size)
        const totalFound = (searchResults as any).found ?? results.length;
        const isLastPage = results.length < perPage || page * perPage >= totalFound;

        return {
          results,
          isLastPage,
        };
      }
    } catch (_error) {
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
