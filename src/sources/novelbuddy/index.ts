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
  TextFilter,
  ToggleFilter,
} from "@suwatte/toolchain";

import {
  API_URL,
  BASE_URL,
  FEEDS,
  GENRE_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
} from "./constants";
import { info } from "./info";
import {
  novelUrl,
  parseDeepLinkSlug,
  parseListResponse,
  toChapterHtml,
  toChapters,
  toContent,
} from "./parsers";
import { buildListPath, buildSearchPath } from "./search";
import {
  NovelBuddyChapterDetails,
  NovelBuddyChapterList,
  NovelBuddyResponse,
  NovelBuddySearchResponse,
  NovelBuddyTitle,
  NovelBuddyTitleDetails,
} from "./types";

export default class NovelBuddy implements Delegate {
  static info: SourceInfo = info;

  client = new HttpClient({
    baseUrl: API_URL,
    rateLimit: {
      permits: 3,
      period: 1,
    },
    headers: {
      Accept: "application/json",
      Origin: BASE_URL,
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
    const path = buildListPath({ sort: feed.sort, status: feed.status }, page);
    return parseListResponse(await this.fetchData<NovelBuddySearchResponse>(path));
  }

  // =============================== Search ===============================

  async getSortOptions(): Promise<SortOptions> {
    return {
      options: SORT_OPTIONS,
      disableOrdering: true,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    return [
      SearchFilter("genres", "Genres", SelectFilter(GENRE_OPTIONS, true)),
      SearchFilter("status", "Status", PickerFilter(STATUS_OPTIONS)),
      SearchFilter("type", "Origin", PickerFilter(TYPE_OPTIONS)),
      SearchFilter("min_chapters", "Minimum Chapters", TextFilter()),
      SearchFilter("mtl", "Machine Translations Only", ToggleFilter()),
    ];
  }

  async getSearchResults(
    request: SearchRequest,
    page: number
  ): Promise<PagedItemList> {
    const deepLinkSlug = parseDeepLinkSlug(request.query?.trim() || "");
    if (deepLinkSlug && page === 1) {
      try {
        const content = await this.getContent(deepLinkSlug);
        return {
          items: [
            {
              id: deepLinkSlug,
              title: content.title,
              coverImage: content.coverImage,
              webUrl: novelUrl(deepLinkSlug),
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
    return parseListResponse(await this.fetchData<NovelBuddySearchResponse>(path));
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    return toContent(await this.fetchTitle(contentId));
  }

  // =============================== Chapters ===============================

  /** The chapter list is keyed by the title's internal id and served stale unless `cv` is passed. */
  async getChapters(contentId: string): Promise<Chapter[]> {
    const title = await this.fetchTitle(contentId);
    const cv = title.cv ? `?cv=${title.cv}` : "";
    const list = await this.fetchData<NovelBuddyChapterList>(
      `/titles/${title.id}/chapters${cv}`
    );
    return toChapters(list.chapters ?? [], contentId);
  }

  // ============================= Chapter Text =============================

  async getChapterText(
    contentId: string,
    chapterId: string
  ): Promise<SourceChapterText> {
    const details = await this.fetchData<NovelBuddyChapterDetails>(
      `/titles/by-slug/${encodeURIComponent(contentId)}/chapters/${encodeURIComponent(chapterId)}?include=details`
    );
    const body = details.chapter?.content ? toChapterHtml(details.chapter.content) : null;
    if (!body) {
      throw new ChapterUnavailableError(
        `Chapter text unavailable: ${novelUrl(contentId)}/${chapterId}`
      );
    }

    return {
      format: SourceChapterTextFormat.HTML,
      body,
      resources: [],
    };
  }

  // =============================== Helpers ===============================

  private async fetchTitle(slug: string): Promise<NovelBuddyTitle> {
    const details = await this.fetchData<NovelBuddyTitleDetails>(
      `/titles/by-slug/${encodeURIComponent(slug)}?include=details`
    );
    return details.title;
  }

  private async fetchData<T>(path: string): Promise<T> {
    const response = await this.client.get(path);
    const payload = await response.json<NovelBuddyResponse<T>>();
    return payload.data;
  }
}
