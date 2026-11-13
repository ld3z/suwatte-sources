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
  PickerFilter,
  SearchFilter,
  SearchRequest,
  SelectFilter,
  SortOptions,
  SourceConfiguration,
  SourceInfo,
  SourceVariant,
  TextFilter,
  ToggleFilter,
  UIForm,
} from "@suwatte/toolchain";

import {
  ALL_LANGUAGES,
  BASE_URL,
  CATEGORY_OPTIONS,
  FEEDS,
  GALLERY_CACHE_TTL_MS,
  HOME_URL,
  LANGUAGE_OPTIONS,
  QUERY_LIST_PREFIX,
  SORT_OPTIONS,
  SortKey,
  USER_AGENT,
} from "./constants";
import { info, variants } from "./info";
import {
  cardToItem,
  detailToItem,
  galleryUrl,
  isCardVisible,
  parseGalleryHtml,
  parseListingHtml,
  toChapter,
  toChapterPages,
  toContent,
} from "./parsers";
import {
  SearchRoute,
  buildSearchRoute,
  hasActiveFilters,
  parseDeepLink,
  sortById,
} from "./search";
import {
  Preferences,
  buildSettingsForm,
  loadPreferences,
  savePreferences,
} from "./settings";
import { ParsedGalleryDetail } from "./types";

const GALLERY_CACHE_SIZE = 100;

export default class IMHentai implements Delegate {
  static info: SourceInfo = info;
  static variants: SourceVariant[] = variants;

  client = new HttpClient({
    baseUrl: BASE_URL,
    cloudflareResolutionURL: HOME_URL,
    timeout: 30_000,
    retries: 2,
    rateLimit: {
      permits: 4,
      period: 1,
    },
    headers: {
      "User-Agent": USER_AGENT,
      Referer: `${BASE_URL}/`,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.8",
    },
  });

  private readonly language: string;
  private galleryCache = new Map<
    string,
    { detail: ParsedGalleryDetail; fetchedAt: number }
  >();

  constructor(args?: Record<string, unknown>) {
    const language = args?.language;
    this.language =
      typeof language === "string" && language ? language : ALL_LANGUAGES;
  }

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
    const key = request.key ?? "lt";

    if (key.startsWith(QUERY_LIST_PREFIX)) {
      const query = key.slice(QUERY_LIST_PREFIX.length);
      const sort = sortById(request.sort?.key);
      return this.executeRoute(
        buildSearchRoute({ query }, this.language, sort, page, prefs),
        prefs
      );
    }

    const sort = sortById(key);
    return this.executeRoute(
      buildSearchRoute({}, this.language, sort, page, prefs),
      prefs
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
    const filters: SearchFilter[] = [
      SearchFilter("category", "Category", SelectFilter(CATEGORY_OPTIONS, true)),
      SearchFilter(
        "tags",
        "Tags",
        TextFilter(),
        "Comma-separated; prefix with - to exclude (e.g. big breasts, -yaoi)"
      ),
      SearchFilter(
        "artists",
        "Artists",
        TextFilter(),
        "Comma-separated; prefix with - to exclude"
      ),
      SearchFilter(
        "groups",
        "Groups",
        TextFilter(),
        "Comma-separated; prefix with - to exclude"
      ),
      SearchFilter(
        "parodies",
        "Parodies",
        TextFilter(),
        "Comma-separated; e.g. original, neon genesis evangelion"
      ),
      SearchFilter("characters", "Characters", TextFilter(), "Comma-separated"),
      SearchFilter("speechless", "Speechless Only", ToggleFilter()),
      SearchFilter("random", "Random Gallery", ToggleFilter()),
    ];
    if (this.language === ALL_LANGUAGES) {
      filters.push(
        SearchFilter("language", "Language", PickerFilter(LANGUAGE_OPTIONS))
      );
    }
    return filters;
  }

  async getSearchResults(
    request: SearchRequest,
    page: number
  ): Promise<PagedItemList> {
    const prefs = await loadPreferences();
    const filters = (request.filters ?? {}) as Record<string, unknown>;

    if (filters.random === true) {
      if (page > 1) return { items: [], isLastPage: true };
      const detail = await this.fetchRandomGallery();
      return {
        items: [detailToItem(detail, this.language, prefs)],
        total: 1,
        isLastPage: true,
      };
    }

    const filtersActive = hasActiveFilters(filters);
    const deepLink = parseDeepLink(request.query ?? "", !filtersActive);
    if (deepLink && page === 1) {
      try {
        const detail =
          deepLink.kind === "random"
            ? await this.fetchRandomGallery()
            : await this.fetchGallery(deepLink.id);
        return {
          items: [detailToItem(detail, this.language, prefs)],
          total: 1,
          isLastPage: true,
        };
      } catch (error) {
        if (error instanceof CloudflareError) throw error;
        // Fall back to a regular search if the direct gallery ID was not found.
      }
    }

    const sort: SortKey = sortById(request.sort?.key);
    return this.executeRoute(
      buildSearchRoute(request, this.language, sort, page, prefs),
      prefs
    );
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    const [detail, prefs] = await Promise.all([
      this.fetchGallery(contentId),
      loadPreferences(),
    ]);
    return toContent(detail, this.language, prefs);
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    return [toChapter(await this.fetchGallery(contentId))];
  }

  async getChapterPages(
    contentId: string,
    _chapterId: string
  ): Promise<ChapterPage[]> {
    const detail = await this.fetchGallery(contentId);
    const pages = toChapterPages(detail);
    if (pages.length === 0) {
      throw new ChapterUnavailableError(
        `Chapter pages unavailable: ${galleryUrl(contentId)}`
      );
    }
    return pages;
  }

  // =============================== Settings ===============================

  async getSettingsPage(): Promise<UIForm> {
    return buildSettingsForm(await loadPreferences());
  }

  async onFormSubmitted(
    _id: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await savePreferences(data ?? {});
  }

  // =============================== Helpers ===============================

  private async executeRoute(
    route: SearchRoute,
    prefs: Preferences
  ): Promise<PagedItemList> {
    const response = await this.client.get(route.path, { params: route.params });
    const parsed = parseListingHtml(await response.text());
    const visible = parsed.items.filter((card) =>
      isCardVisible(card, this.language, prefs)
    );
    // Keep at least one item when a mid-stream page happens to be filtered out
    // so Suwatte's PagedItemList validator and infinite scroll can advance.
    const effectiveCards =
      visible.length === 0 && parsed.hasNextPage && parsed.items.length > 0
        ? [parsed.items[0]]
        : visible;

    return {
      items: effectiveCards.map((card) =>
        cardToItem(card, this.language, prefs)
      ),
      total: parsed.total,
      isLastPage: !parsed.hasNextPage || parsed.items.length === 0,
    };
  }

  private async fetchGallery(id: string): Promise<ParsedGalleryDetail> {
    const cleanId = id.trim();
    const cached = this.galleryCache.get(cleanId);
    if (cached && Date.now() - cached.fetchedAt < GALLERY_CACHE_TTL_MS) {
      return cached.detail;
    }

    const response = await this.client.get(
      `/gallery/${encodeURIComponent(cleanId)}/`
    );
    const detail = parseGalleryHtml(await response.text(), cleanId);
    this.galleryCache.set(cleanId, { detail, fetchedAt: Date.now() });
    trim(this.galleryCache, GALLERY_CACHE_SIZE);
    return detail;
  }

  private async fetchRandomGallery(): Promise<ParsedGalleryDetail> {
    const response = await this.client.get("/random/");
    const urlId = /\/gallery\/(\d+)/i.exec(response.url)?.[1];
    const detail = parseGalleryHtml(await response.text(), urlId);
    this.galleryCache.set(detail.id, { detail, fetchedAt: Date.now() });
    trim(this.galleryCache, GALLERY_CACHE_SIZE);
    return detail;
  }
}

function trim<K, V>(map: Map<K, V>, size: number) {
  while (map.size > size) map.delete(map.keys().next().value as K);
}
