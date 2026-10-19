"use httpclient";

import {
  Chapter,
  ChapterPage,
  ChapterUnavailableError,
  Content,
  Delegate,
  HomePage,
  ItemListRequest,
  PagedItemList,
  SearchFilter,
  SearchRequest,
  SelectFilter,
  SortOptions,
  SourceConfiguration,
  SourceInfo,
} from "@suwatte/toolchain";

import {
  ADULT_COOKIE,
  BASE_URL,
  CONTENT_OPTIONS,
  FEEDS,
  GENRE_OPTIONS,
  PAGE_WIDTH,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  USER_AGENT,
} from "./constants";
import { decryptPageList } from "./crypto";
import { info } from "./info";
import {
  chapterUrl,
  parseChapters,
  parseContent,
  parseDeepLinkId,
  parseListing,
  parseReaderPage,
  parseSealKey,
  parseSeriesIdFromChapterPage,
  ReaderPage,
} from "./parsers";
import { buildBrowsePath, buildSearchPath } from "./search";

export default class YaoiMe implements Delegate {
  static info: SourceInfo = info;

  client = new HttpClient({
    baseUrl: BASE_URL,
    cloudflareResolutionURL: BASE_URL,
    rateLimit: {
      permits: 2,
      period: 1,
    },
    headers: {
      Referer: `${BASE_URL}/`,
      Cookie: ADULT_COOKIE,
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.8",
    },
  });

  private sealKey?: { build?: string; key: string };

  getConfiguration(): SourceConfiguration {
    return {
      imageReferer: `${BASE_URL}/`,
    };
  }

  // =============================== Home Page ===============================

  async getHomePage(): Promise<HomePage> {
    return {
      feeds: FEEDS.map((feed) => ({
        id: feed.id,
        title: feed.title,
        content: {
          list: { key: feed.id },
        },
      })),
    };
  }

  // ============================== Item List ===============================

  async getItemList(
    request: ItemListRequest,
    page: number
  ): Promise<PagedItemList> {
    const feed = FEEDS.find((f) => f.id === request.key) ?? FEEDS[0];
    return parseListing(
      await this.fetchHtml(buildBrowsePath({ sort: feed.sort }, page))
    );
  }

  // =============================== Search ===============================

  async getSortOptions(): Promise<SortOptions> {
    return {
      options: SORT_OPTIONS,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    return [
      SearchFilter("types", "Type", SelectFilter(TYPE_OPTIONS, false)),
      SearchFilter("genres", "Genres", SelectFilter(GENRE_OPTIONS, true)),
      SearchFilter("status", "Status", SelectFilter(STATUS_OPTIONS, false)),
      SearchFilter("content", "Content Rating", SelectFilter(CONTENT_OPTIONS, false)),
    ];
  }

  async getSearchResults(
    request: SearchRequest,
    page: number
  ): Promise<PagedItemList> {
    const deepLinkId = parseDeepLinkId(request.query?.trim() || "");
    if (deepLinkId && page === 1) {
      const contentId = deepLinkId.startsWith("chapter:")
        ? await this.resolveChapterDeepLink(deepLinkId.slice("chapter:".length))
        : deepLinkId;
      if (contentId) {
        try {
          const content = await this.getContent(contentId);
          return {
            items: [
              {
                id: contentId,
                title: content.title,
                coverImage: content.coverImage,
                webUrl: content.webUrl,
                rating: content.rating,
              },
            ],
            isLastPage: true,
          };
        } catch {
          // Fall back to a normal search if the direct lookup fails.
        }
      }
    }

    return parseListing(await this.fetchHtml(buildSearchPath(request, page)));
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    return parseContent(await this.fetchHtml(`/series/${contentId}`), contentId);
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    return parseChapters(await this.fetchHtml(`/series/${contentId}`));
  }

  async getChapterPages(
    _contentId: string,
    chapterId: string
  ): Promise<ChapterPage[]> {
    const reader = parseReaderPage(await this.fetchHtml(`/chapter/${chapterId}`));
    let hashes = reader.hashes.filter(Boolean);
    if (!hashes.length && reader.sealed) {
      hashes = await this.decryptSealedPages(reader);
    }
    if (!hashes.length) {
      throw new ChapterUnavailableError(
        `Chapter pages unavailable: ${chapterUrl(chapterId)}`
      );
    }
    return hashes.map((hash) => ({
      url: `${BASE_URL}/i/p/${hash}?w=${PAGE_WIDTH}`,
    }));
  }

  // =============================== Helpers ===============================

  private async fetchHtml(path: string): Promise<string> {
    const response = await this.client.get(path);
    return response.text();
  }

  /** Follows a `/chapter/{seriesId}/{chapterId}` link back to its canonical title. */
  private async resolveChapterDeepLink(chapterId: string): Promise<string | null> {
    try {
      const html = await this.fetchHtml(`/chapter/${chapterId}`);
      return parseSeriesIdFromChapterPage(html);
    } catch {
      return null;
    }
  }

  private async decryptSealedPages(reader: ReaderPage, refresh = false): Promise<string[]> {
    try {
      const hashes = decryptPageList(
        reader.sealed ?? "",
        await this.getSealKey(reader, refresh)
      );
      if (hashes.length) return hashes;
    } catch {
      if (refresh) throw new Error("Could not decrypt the page list.");
    }
    if (!refresh) return this.decryptSealedPages(reader, true);
    return [];
  }

  private async getSealKey(reader: ReaderPage, refresh = false): Promise<string> {
    if (!refresh && reader.build && this.sealKey?.build === reader.build) {
      return this.sealKey.key;
    }
    for (const path of reader.scripts) {
      try {
        const key = parseSealKey(await this.fetchHtml(path));
        if (key) {
          this.sealKey = { build: reader.build, key };
          return key;
        }
      } catch {
        // Try the next reader script.
      }
    }
    throw new Error("The site's reader script no longer carries a page-list key.");
  }
}
