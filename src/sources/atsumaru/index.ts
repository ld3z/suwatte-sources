"use httpclient";

import {
  Chapter,
  ChapterPage,
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
  ToggleFilter,
  UIForm,
} from "@suwatte/toolchain";

import {
  BASE_URL,
  BROWSE_LIMIT,
  DEFAULT_CONTENT_TYPES,
  FEEDS,
  GENRE_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
} from "./constants";
import { info } from "./info";
import { toChapters, toContent, toItem } from "./parsers";
import { buildSearchPath, parseDeepLinkId, parseSearchResponse } from "./search";
import {
  allowedContentRatings,
  buildSettingsForm,
  loadPreferences,
  savePreferences,
} from "./settings";
import {
  AtsumaruAllChaptersResponse,
  AtsumaruAvailableFilters,
  AtsumaruBrowseResponse,
  AtsumaruMangaPageResponse,
  AtsumaruReadChapterResponse,
  AtsumaruSearchResponse,
} from "./types";
import { formatImageUrl, matchesHiddenKeyword } from "./utils";

export default class Atsumaru implements Delegate {
  static info: SourceInfo = info;

  client = new HttpClient({
    baseUrl: BASE_URL,
    rateLimit: {
      permits: 2,
      period: 1,
    },
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
    },
  });

  /** Scanlator id -> name, per content id. */
  private scanlatorMapCache = new Map<string, Map<string, string>>();
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

    const params = [
      `offset=${(page - 1) * BROWSE_LIMIT}`,
      `limit=${BROWSE_LIMIT}`,
      `types=${(prefs.contentTypes ?? DEFAULT_CONTENT_TYPES).join(",")}`,
      "mediums=Comic",
      `contentRatings=${allowedContentRatings(prefs.maxContentRating).join(",")}`,
    ];
    if (prefs.showAdult) params.push("adult=1");
    if (prefs.excludedGenres.length > 0) {
      params.push(`excludedTags=${prefs.excludedGenres.join(",")}`);
    }
    if (feed.timeframe) params.push(`timeframe=${feed.timeframe}`);

    const response = await this.client.get(
      `/api/home2/${feed.endpoint}?${params.join("&")}`
    );
    const data = await response.json<AtsumaruBrowseResponse>();
    const rawItems = data.items || [];

    // Items without a chapter count are kept since they can't be checked.
    const items = rawItems
      .filter(
        (item) =>
          typeof item.chapterCount !== "number" ||
          item.chapterCount >= prefs.minChapters
      )
      .filter((item) => !matchesHiddenKeyword(item, prefs.hiddenKeywords))
      .map(toItem);

    return {
      items,
      isLastPage: rawItems.length < BROWSE_LIMIT,
    };
  }

  // =============================== Search ===============================

  async getSortOptions(): Promise<SortOptions> {
    return {
      options: SORT_OPTIONS,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    if (this.cachedFilters) {
      return this.cachedFilters;
    }

    let genreOptions = GENRE_OPTIONS;
    let typeOptions = TYPE_OPTIONS;
    let statusOptions = STATUS_OPTIONS;

    try {
      const response = await this.client.get("/api/explore/availableFilters");
      const data = await response.json<AtsumaruAvailableFilters>();
      genreOptions = toOptions(
        data.genres?.map((g) => ({ id: String(g.id), name: g.name })),
        genreOptions
      );
      typeOptions = toOptions(data.types, typeOptions);
      statusOptions = toOptions(data.statuses, statusOptions);
    } catch {
      // Keep the static fallback options if the request fails.
    }

    this.cachedFilters = [
      SearchFilter("genres", "Genres", SelectFilter(genreOptions, true)),
      SearchFilter("types", "Content Type", SelectFilter(typeOptions, false)),
      SearchFilter("status", "Publishing Status", SelectFilter(statusOptions, false)),
      SearchFilter("year", "Release Year (e.g. 2024)", TextFilter()),
      SearchFilter("min_chapters", "Minimum Chapters", TextFilter()),
      SearchFilter("official", "Only Official Translations", ToggleFilter()),
    ];
    return this.cachedFilters;
  }

  async getSearchResults(
    request: SearchRequest,
    page: number
  ): Promise<PagedItemList> {
    const deepLinkId = parseDeepLinkId(request.query?.trim() || "");
    if (deepLinkId) {
      try {
        const content = await this.getContent(deepLinkId);
        return {
          items: [
            {
              id: deepLinkId,
              title: content.title,
              coverImage: content.coverImage,
              webUrl: `${BASE_URL}/manga/${deepLinkId}`,
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
    const data = await response.json<AtsumaruSearchResponse>();
    return parseSearchResponse(data, page, prefs.hiddenKeywords);
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    const response = await this.client.get(`/api/manga/page?id=${contentId}`);
    const data = await response.json<AtsumaruMangaPageResponse>();
    const page = data.mangaPage;

    if (page.scanlators && Array.isArray(page.scanlators)) {
      this.scanlatorMapCache.set(
        contentId,
        new Map(page.scanlators.map((s) => [s.id, s.name]))
      );
    }

    return toContent(page, contentId);
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    const [scanlators, chaptersResponse] = await Promise.all([
      this.getScanlators(contentId),
      this.client.get(`/api/manga/allChapters?mangaId=${contentId}`),
    ]);
    const data = await chaptersResponse.json<AtsumaruAllChaptersResponse>();
    return toChapters(data.chapters || [], scanlators, contentId);
  }

  async getChapterPages(
    contentId: string,
    chapterId: string
  ): Promise<ChapterPage[]> {
    const response = await this.client.get(
      `/api/read/chapter?mangaId=${contentId}&chapterId=${chapterId}`
    );
    const data = await response.json<AtsumaruReadChapterResponse>();
    const pages = data.readChapter?.pages || [];

    return pages.map((page) => ({
      url: formatImageUrl(page.image),
    }));
  }

  // =============================== Settings ===============================

  async getSettingsPage(): Promise<UIForm> {
    return buildSettingsForm(await loadPreferences());
  }

  async onFormSubmitted(_id: string, data: any): Promise<void> {
    await savePreferences(data);
  }

  // =============================== Helpers ===============================

  private async getScanlators(contentId: string): Promise<Map<string, string>> {
    const cached = this.scanlatorMapCache.get(contentId);
    if (cached) return cached;

    const response = await this.client.get(`/api/manga/page?id=${contentId}`);
    const data = await response.json<AtsumaruMangaPageResponse>();
    const scanlators = new Map(
      (data.mangaPage?.scanlators || []).map((s) => [s.id, s.name])
    );
    this.scanlatorMapCache.set(contentId, scanlators);
    return scanlators;
  }
}

/** Maps API `{ id, name }` entries to options, or returns the fallback if there are none. */
function toOptions(
  entries: { id: string; name: string }[] | undefined,
  fallback: LabeledOption[]
): LabeledOption[] {
  return entries && entries.length > 0
    ? entries.map((e) => ({ id: e.id, title: e.name }))
    : fallback;
}
