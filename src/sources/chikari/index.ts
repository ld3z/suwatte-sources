"use httpclient";

import {
  Chapter,
  ChapterPage,
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
  TYPE_OPTIONS,
} from "./constants";
import { info } from "./info";
import {
  parseChapterId,
  parseDeepLinkSlug,
  seriesUrl,
  toChapters,
  toContent,
} from "./parsers";
import { buildListPath, buildSearchPath, parseListResponse } from "./search";
import { buildSettingsForm, loadPreferences, savePreferences } from "./settings";
import {
  ChikariChapterListResponse,
  ChikariChapterRead,
  ChikariGenre,
  ChikariSeries,
  ChikariSeriesListResponse,
  ChikariTag,
} from "./types";
import { buildQueryString } from "./utils";

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
      {
        sort: feed.sort,
        statuses: feed.status ? [feed.status] : undefined,
        browse: true,
      },
      page,
      prefs
    );
    const response = await this.client.get(path);
    return parseListResponse(
      await response.json<ChikariSeriesListResponse>(),
      page,
      prefs.hiddenKeywords
    );
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
      this.fetchOptions<ChikariGenre>("/api/genres", (g) => ({
        id: g.slug,
        title: g.name,
      })),
      this.fetchOptions<ChikariTag>("/api/tags", (t) => ({
        id: String(t.id),
        title: t.name,
      })),
    ]);

    const filters = [
      SearchFilter("types", "Type", SelectFilter(TYPE_OPTIONS, false)),
      SearchFilter("genres", "Genres", SelectFilter(genreOptions ?? GENRE_OPTIONS, true)),
      SearchFilter("status", "Status", SelectFilter(STATUS_OPTIONS, false)),
      SearchFilter("min_chapters", "Minimum Chapters", TextFilter()),
    ];
    if (tagOptions) {
      filters.splice(2, 0, SearchFilter("tags", "Tags", SelectFilter(tagOptions, true)));
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
              webUrl: seriesUrl(deepLinkSlug),
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
    return parseListResponse(
      await response.json<ChikariSeriesListResponse>(),
      page,
      prefs.hiddenKeywords
    );
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    const response = await this.client.get(`/api/series/${contentId}`);
    return toContent(await response.json<ChikariSeries>());
  }

  // =============================== Chapters ===============================

  /** Chapter lists are paginated (500 per page), so all pages are fetched and merged. */
  async getChapters(contentId: string): Promise<Chapter[]> {
    const fetchPage = async (offset: number) => {
      const response = await this.client.get(
        `/api/series/${contentId}/chapters?limit=${CHAPTER_PAGE_LIMIT}&offset=${offset}`
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

  async getChapterPages(
    contentId: string,
    chapterId: string
  ): Promise<ChapterPage[]> {
    const { number, scan } = parseChapterId(chapterId);
    const query = buildQueryString({ scan });
    const response = await this.client.get(
      `/api/series/${contentId}/chapters/${number}${query ? `?${query}` : ""}`
    );
    const chapter = await response.json<ChikariChapterRead>();

    const pages = chapter.pages ?? [];
    if (pages.length === 0) {
      throw new ChapterUnavailableError("Chapter pages unavailable");
    }
    return pages.map((url) => ({ url }));
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
