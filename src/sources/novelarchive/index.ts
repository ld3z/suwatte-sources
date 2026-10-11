"use httpclient";

import {
  Chapter,
  ChapterUnavailableError,
  Content,
  Delegate,
  HomePage,
  ItemListRequest,
  LabeledOption,
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
  FEEDS,
  GENRE_MATCH_OPTIONS,
  GENRE_OPTIONS,
  SHORT_LIST_LIMIT,
  SORT_OPTIONS,
  STATUS_OPTIONS,
} from "./constants";
import { info } from "./info";
import {
  chapterUrl,
  novelUrl,
  parseDeepLinkId,
  parseListResponse,
  toChapterHtml,
  toChapters,
  toContent,
} from "./parsers";
import { buildListPath, buildSearchPath } from "./search";
import {
  NovelArchiveChapterResponse,
  NovelArchiveGenre,
  NovelArchiveListResponse,
  NovelArchiveNovel,
  NovelArchiveNovelResponse,
} from "./types";

export default class NovelArchive implements Delegate {
  static info: SourceInfo = info;

  client = new HttpClient({
    baseUrl: `${BASE_URL}/api`,
    rateLimit: {
      permits: 3,
      period: 1,
    },
    headers: {
      Accept: "application/json",
      Referer: `${BASE_URL}/`,
    },
  });

  private cachedFilters: SearchFilter[] | null = null;

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
    if (feed.endpoint) {
      if (page > 1) return { items: [], isLastPage: true };
      const data = await this.fetchJson<NovelArchiveListResponse>(
        `${feed.endpoint}?limit=${SHORT_LIST_LIMIT}`
      );
      return parseListResponse(data, false);
    }

    const path = buildListPath({ sort: feed.sort, status: feed.status }, page);
    return parseListResponse(await this.fetchJson<NovelArchiveListResponse>(path), true);
  }

  // =============================== Search ===============================

  async getSortOptions(): Promise<SortOptions> {
    return {
      options: SORT_OPTIONS,
      disableOrdering: true,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    if (this.cachedFilters) {
      return this.cachedFilters;
    }

    const genreOptions = await this.fetchGenreOptions();
    const filters = [
      SearchFilter("genres", "Genres", SelectFilter(genreOptions ?? GENRE_OPTIONS, true)),
      SearchFilter("genre_match", "Genre Matching", PickerFilter(GENRE_MATCH_OPTIONS)),
      SearchFilter("status", "Status", PickerFilter(STATUS_OPTIONS)),
    ];
    if (genreOptions) {
      this.cachedFilters = filters;
    }
    return filters;
  }

  async getSearchResults(
    request: SearchRequest,
    page: number
  ): Promise<PagedItemList> {
    const deepLinkId = parseDeepLinkId(request.query?.trim() || "");
    if (deepLinkId && page === 1) {
      try {
        const content = await this.getContent(deepLinkId);
        return {
          items: [
            {
              id: deepLinkId,
              title: content.title,
              coverImage: content.coverImage,
              webUrl: novelUrl(deepLinkId),
              rating: content.rating,
            },
          ],
          isLastPage: true,
        };
      } catch {
        // Fall back to a normal search if the direct lookup fails.
      }
    }

    const path = buildSearchPath(request, page);
    return parseListResponse(await this.fetchJson<NovelArchiveListResponse>(path), true);
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    return toContent(await this.fetchNovel(contentId));
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    return toChapters(await this.fetchNovel(contentId));
  }

  // ============================= Chapter Text =============================

  /** `prefetch=1` skips the full chapter-name list and the view count. */
  async getChapterText(
    contentId: string,
    chapterId: string
  ): Promise<SourceChapterText> {
    const data = await this.fetchJson<NovelArchiveChapterResponse>(
      `/novels/${encodeURIComponent(contentId)}/chapters/${encodeURIComponent(chapterId)}?prefetch=1`
    );
    const body = data.chapter?.content ? toChapterHtml(data.chapter.content) : "";
    if (!body) {
      throw new ChapterUnavailableError(
        `Chapter text unavailable: ${chapterUrl(contentId, chapterId)}`
      );
    }

    return {
      format: SourceChapterTextFormat.HTML,
      body,
      resources: [],
    };
  }

  // =============================== Helpers ===============================

  private async fetchNovel(id: string): Promise<NovelArchiveNovel> {
    const data = await this.fetchJson<NovelArchiveNovelResponse>(
      `/novels/${encodeURIComponent(id)}`
    );
    return data.novel;
  }

  /** Fetches the live genre list, or returns null so the static fallback can be used. */
  private async fetchGenreOptions(): Promise<LabeledOption[] | null> {
    try {
      const data = await this.fetchJson<{ genres: NovelArchiveGenre[] }>("/novels/genres");
      const genres = (data.genres ?? []).filter((g) => g.value && g.label);
      return genres.length > 0 ? genres.map((g) => ({ id: g.value, title: g.label })) : null;
    } catch {
      return null;
    }
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await this.client.get(path);
    return response.json<T>();
  }
}
