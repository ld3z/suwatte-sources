"use httpclient";

import {
  Chapter,
  ChapterUnavailableError,
  Content,
  Delegate,
  HomePage,
  ItemListRequest,
  PagedItemList,
  PickerFilter,
  SearchFilter,
  SearchRequest,
  SelectFilter,
  SortOptions,
  SourceChapterText,
  SourceChapterTextFormat,
  SourceConfiguration,
  SourceInfo,
} from "@suwatte/toolchain";

import {
  BASE_URL,
  CHAPTER_COUNT_OPTIONS,
  FEEDS,
  GENRE_MODE_OPTIONS,
  GENRE_OPTIONS,
  MIN_RATING_OPTIONS,
  ORIGIN_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
} from "./constants";
import { info } from "./info";
import {
  bookIdFromUrl,
  bookUrl,
  parseChapterPage,
  parseChapterText,
  parseContent,
  parseLastChapterPage,
  parseListing,
} from "./parsers";
import { buildSearchPath, searchResultsScope } from "./search";
import { wait } from "./utils";

const MAX_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RETRY_AFTER_SECONDS = 10;

export default class NovelFire implements Delegate {
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
    },
  });

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
    return parseListing(await this.fetchHtml(feed.path(page)));
  }

  // =============================== Search ===============================

  async getSortOptions(): Promise<SortOptions> {
    return {
      options: SORT_OPTIONS,
      disableOrdering: true,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    const note = "Filters only apply when the search text is empty.";
    return [
      SearchFilter("genres", "Genres", SelectFilter(GENRE_OPTIONS), note),
      SearchFilter("genre_mode", "Genre Matching", PickerFilter(GENRE_MODE_OPTIONS)),
      SearchFilter("origin", "Origin", SelectFilter(ORIGIN_OPTIONS)),
      SearchFilter("status", "Status", PickerFilter(STATUS_OPTIONS)),
      SearchFilter("chapters", "Chapter Count", PickerFilter(CHAPTER_COUNT_OPTIONS)),
      SearchFilter("min_rating", "Minimum Rating", PickerFilter(MIN_RATING_OPTIONS)),
    ];
  }

  async getSearchResults(
    request: SearchRequest,
    page: number
  ): Promise<PagedItemList> {
    const deepLinkId = bookIdFromUrl(request.query?.trim());
    if (deepLinkId && page === 1) {
      try {
        const content = await this.getContent(deepLinkId);
        return {
          items: [
            {
              id: deepLinkId,
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

    const html = await this.fetchHtml(buildSearchPath(request, page));
    return parseListing(html, searchResultsScope(request));
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    return parseContent(await this.fetchHtml(`/book/${contentId}`), contentId);
  }

  // =============================== Chapters ===============================

  /** Chapter lists are paginated (100 per page), so all pages are fetched and merged. */
  async getChapters(contentId: string): Promise<Chapter[]> {
    const chaptersPath = `/book/${contentId}/chapters`;
    const firstPage = await this.fetchHtml(chaptersPath);
    const lastPage = parseLastChapterPage(firstPage);

    const remainingPages = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, i) =>
        this.fetchHtml(`${chaptersPath}?page=${i + 2}`)
      )
    );

    const chapters = [firstPage, ...remainingPages]
      .flatMap((html) => parseChapterPage(html, contentId))
      .reverse();
    chapters.forEach((chapter, index) => {
      chapter.index = index;
    });
    return chapters;
  }

  // ============================= Chapter Text =============================

  async getChapterText(
    contentId: string,
    chapterId: string
  ): Promise<SourceChapterText> {
    const html = await this.fetchHtml(`/book/${contentId}/${chapterId}`);
    const body = parseChapterText(html);
    if (!body) {
      throw new ChapterUnavailableError(`Chapter text unavailable: ${bookUrl(contentId)}/${chapterId}`);
    }

    return {
      format: SourceChapterTextFormat.HTML,
      body,
      resources: [],
    };
  }

  // =============================== Helpers ===============================

  /** Fetches a page, retrying when Cloudflare rate limits (about 27 requests per 10 seconds). */
  private async fetchHtml(path: string, attempt = 0): Promise<string> {
    try {
      const response = await this.client.get(path);
      return await response.text();
    } catch (error) {
      const response = (error as any)?.response;
      if (response?.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;

      const retryAfter = Number(response.headers?.get?.("retry-after"));
      await wait((retryAfter > 0 ? retryAfter : DEFAULT_RETRY_AFTER_SECONDS) * 1000);
      return this.fetchHtml(path, attempt + 1);
    }
  }
}
