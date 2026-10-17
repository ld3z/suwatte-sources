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
  SearchFilter,
  SearchRequest,
  SelectFilter,
  SortOptions,
  SourceChapterText,
  SourceChapterTextFormat,
  SourceConfiguration,
  SourceInfo,
  TextFilter,
  UIForm,
} from "@suwatte/toolchain";

import {
  BASE_URL,
  CHAPTER_PAGE_LIMIT,
  FEEDS,
  GENRE_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
} from "./constants";
import { info } from "./info";
import {
  novelUrl,
  parseDeepLinkSlug,
  toChapterHtml,
  toChapters,
  toContent,
} from "./parsers";
import { buildListPath, buildSearchPath, parseListResponse } from "./search";
import { buildSettingsForm, loadPreferences, savePreferences } from "./settings";
import {
  ChikariChapterListResponse,
  ChikariChapterRead,
  ChikariGenre,
  ChikariNovel,
  ChikariNovelListResponse,
  ChikariTag,
} from "./types";

export default class Chikari implements Delegate {
  static info: SourceInfo = info;

  client = new HttpClient({
    baseUrl: BASE_URL,
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
    const prefs = await loadPreferences();
    const feed = FEEDS.find((f) => f.id === request.key) ?? FEEDS[0];
    const path = buildListPath(
      { sort: feed.sort, statuses: feed.status ? [feed.status] : undefined },
      page,
      prefs
    );
    const response = await this.client.get(path);
    return parseListResponse(await response.json<ChikariNovelListResponse>(), page);
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

    const [genreOptions, tagOptions] = await Promise.all([
      this.fetchOptions<ChikariGenre>("/api/novels/genres", (g) => ({
        id: g.slug,
        title: g.name,
      })),
      this.fetchOptions<ChikariTag>("/api/novels/tags", (t) => ({
        id: String(t.id),
        title: t.name,
      })),
    ]);

    const filters = [
      SearchFilter("genres", "Genres", SelectFilter(genreOptions ?? GENRE_OPTIONS, true)),
      SearchFilter("status", "Status", SelectFilter(STATUS_OPTIONS, false)),
      SearchFilter("min_chapters", "Minimum Chapters", TextFilter()),
    ];
    if (tagOptions) {
      filters.splice(1, 0, SearchFilter("tags", "Tags", SelectFilter(tagOptions, true)));
    }

    this.cachedFilters = filters;
    return filters;
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

    const prefs = await loadPreferences();
    const response = await this.client.get(buildSearchPath(request, page, prefs));
    return parseListResponse(await response.json<ChikariNovelListResponse>(), page);
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    const response = await this.client.get(`/api/novels/${contentId}`);
    return toContent(await response.json<ChikariNovel>());
  }

  // =============================== Chapters ===============================

  /** Chapter lists are paginated (500 per page), so all pages are fetched and merged. */
  async getChapters(contentId: string): Promise<Chapter[]> {
    const fetchPage = async (offset: number) => {
      const response = await this.client.get(
        `/api/novels/${contentId}/chapters?limit=${CHAPTER_PAGE_LIMIT}&offset=${offset}`
      );
      return response.json<ChikariChapterListResponse>();
    };

    const first = await fetchPage(0);
    const pageCount = Math.ceil((first.total ?? 0) / CHAPTER_PAGE_LIMIT);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) =>
        fetchPage((i + 1) * CHAPTER_PAGE_LIMIT)
      )
    );

    const rawChapters = [first, ...rest].flatMap((p) => p.items ?? []);
    return toChapters(rawChapters, contentId);
  }

  // ============================= Chapter Text =============================

  async getChapterText(
    contentId: string,
    chapterId: string
  ): Promise<SourceChapterText> {
    const response = await this.client.get(
      `/api/novels/${contentId}/chapters/${chapterId}/read`
    );
    const chapter = await response.json<ChikariChapterRead>();

    if (chapter.locked) {
      throw new ChapterUnavailableError(
        chapter.lock_reason || "This chapter is locked on chikari.moe"
      );
    }
    const body = chapter.body ? toChapterHtml(chapter.body) : "";
    if (!body) {
      throw new ChapterUnavailableError("Chapter text unavailable");
    }

    return {
      format: SourceChapterTextFormat.HTML,
      body,
      resources: [],
    };
  }

  // =============================== Settings ===============================

  async getSettingsPage(): Promise<UIForm> {
    return buildSettingsForm(await loadPreferences());
  }

  async onFormSubmitted(_id: string, data: any): Promise<void> {
    await savePreferences(data);
  }

  // =============================== Helpers ===============================

  /** Fetches filter options, or returns null so a static fallback can be used. */
  private async fetchOptions<T>(
    path: string,
    toOption: (entry: T) => LabeledOption
  ): Promise<LabeledOption[] | null> {
    try {
      const response = await this.client.get(path);
      const entries = await response.json<T[]>();
      return Array.isArray(entries) && entries.length > 0 ? entries.map(toOption) : null;
    } catch {
      return null;
    }
  }
}
