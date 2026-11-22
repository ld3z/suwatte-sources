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
  PickerFilter,
  SearchFilter,
  SearchRequest,
  SelectFilter,
  SortOptions,
  SourceConfiguration,
  SourceInfo,
  SourceVariant,
  TextFilter,
  UIForm,
} from "@suwatte/toolchain";

import {
  ALL_LANGUAGES,
  API_URL,
  BASE_URL,
  CATEGORY_OPTIONS,
  CDN_TTL_MS,
  FAVORITES_FEED,
  FEEDS,
  hiddenTagId,
  humanizeHiddenTag,
  LANGUAGE_OPTIONS,
  LIST_CACHE_TTL_MS,
  PAGE_SIZE,
  QUERY_LIST_PREFIX,
  SEEDED_TAG_IDS,
  SORT_OPTIONS,
  SortKey,
  UPLOADED_OPTIONS,
  USER_AGENT,
} from "./constants";
import { DEFAULT_CDN, imageUrl } from "./images";
import { info, variants } from "./info";
import {
  detailToItem,
  isListItemVisible,
  toChapter,
  toContent,
  toItem,
} from "./parsers";
import {
  EffectiveQuery,
  ParsedQuery,
  buildEffectiveQueries,
  emptyQuery,
  hasActiveFilters,
  parseDeepLinkId,
  parseQueryString,
  parseSearchRequest,
  sortById,
} from "./search";
import {
  Preferences,
  buildSettingsForm,
  clearApiKey,
  loadApiKey,
  loadPreferences,
  savePreferences,
} from "./settings";
import {
  CdnConfig,
  NhentaiGalleryDetail,
  NhentaiListItem,
  NhentaiPaginatedResponse,
} from "./types";

const GALLERY_CACHE_SIZE = 200;
const LIST_CACHE_SIZE = 32;
const TAG_CACHE_SIZE = 2000;

export default class Nhentai implements Delegate {
  static info: SourceInfo = info;
  static variants: SourceVariant[] = variants;

  client = new HttpClient({
    baseUrl: API_URL,
    cloudflareResolutionURL: BASE_URL,
    timeout: 30_000,
    retries: 2,
    rateLimit: {
      permits: 4,
      period: 1,
    },
    headers: {
      Accept: "application/json",
      Referer: `${BASE_URL}/`,
      "User-Agent": USER_AGENT,
    },
  });

  /** Site language name this variant lists, or "all". */
  private readonly language: string;
  private galleries = new Map<string, NhentaiGalleryDetail>();
  private listCache = new Map<
    string,
    { data: NhentaiPaginatedResponse; fetchedAt: number }
  >();
  private tagIds = new Map<string, number>(SEEDED_TAG_IDS);
  /** Show-tag ids resolved via the tag endpoint; `null` means "not found". */
  private resolvedTagIds = new Map<string, number | null>();
  private cdnState?: { config: CdnConfig; fetchedAt: number };
  /** `undefined` until loaded from secure storage; `null` when no key is set. */
  private apiKey?: string | null;

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
    const prefs = await loadPreferences();
    const feeds = prefs.apiKey ? [...FEEDS, FAVORITES_FEED] : FEEDS;
    return {
      feeds: feeds.map((feed) => ({
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
    const key = request.key ?? "";
    if (key === FAVORITES_FEED.id) {
      return this.fetchFavorites(page);
    }
    if (key.startsWith(QUERY_LIST_PREFIX)) {
      const parsed = parseQueryString(key.slice(QUERY_LIST_PREFIX.length));
      return this.executeQuery(parsed, sortById(request.sort?.key), page);
    }
    return this.executeQuery(emptyQuery(), sortById(key), page);
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
        "Comma-separated; e.g. big breasts, full color, -yaoi"
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
        "Comma-separated; e.g. touhou project, original"
      ),
      SearchFilter("characters", "Characters", TextFilter(), "Comma-separated"),
      SearchFilter(
        "pages",
        "Pages",
        TextFilter(),
        "e.g. >=20, 20-100, <=50"
      ),
      SearchFilter("uploaded", "Uploaded", PickerFilter(UPLOADED_OPTIONS)),
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
    const filtersActive = hasActiveFilters(
      request.filters as Record<string, unknown> | undefined
    );
    const deepLinkId = parseDeepLinkId(request.query ?? "", !filtersActive);
    if (deepLinkId && page === 1) {
      try {
        const [gallery, cdn, prefs] = await Promise.all([
          this.fetchGallery(deepLinkId, false),
          this.cdnConfig(),
          loadPreferences(),
        ]);
        return {
          items: [detailToItem(gallery, this.language, cdn, prefs.titleDisplay)],
          total: 1,
          isLastPage: true,
        };
      } catch {
        // Fall back to a regular search if the gallery ID does not exist.
      }
    }

    return this.executeQuery(
      parseSearchRequest(request),
      sortById(request.sort?.key),
      page
    );
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    const [gallery, cdn, prefs] = await Promise.all([
      this.fetchGallery(contentId, true),
      this.cdnConfig(),
      loadPreferences(),
    ]);
    const showTagIds = await this.resolveShowTagIds(prefs.showTags);
    return toContent(
      gallery,
      contentId,
      this.language,
      cdn,
      prefs,
      this.resolveKnownHiddenTagIds(prefs),
      showTagIds
    );
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    return [toChapter(await this.fetchGallery(contentId, false), contentId)];
  }

  async getChapterPages(
    contentId: string,
    _chapterId: string
  ): Promise<ChapterPage[]> {
    const [gallery, cdn] = await Promise.all([
      this.fetchGallery(contentId, false),
      this.cdnConfig(),
    ]);
    return gallery.pages.map((page) => ({
      url: imageUrl(page.path, gallery.media_id, cdn),
    }));
  }

  // =============================== Settings ===============================

  async getSettingsPage(): Promise<UIForm> {
    const prefs = await loadPreferences();
    return buildSettingsForm(prefs, this.discoveredTagOptions());
  }

  async onFormSubmitted(_id: string, data: Record<string, unknown>): Promise<void> {
    await savePreferences(data);
    this.apiKey = undefined;
    this.listCache.clear();
  }

  async clearAuthentication(): Promise<void> {
    await clearApiKey();
    this.apiKey = null;
    this.listCache.clear();
  }

  // =============================== Helpers ===============================

  private async executeQuery(
    parsed: ParsedQuery,
    sort: SortKey,
    page: number
  ): Promise<PagedItemList> {
    const [prefs, cdn] = await Promise.all([loadPreferences(), this.cdnConfig()]);
    const effectiveQueries = buildEffectiveQueries(
      parsed,
      this.language,
      prefs.hiddenTags,
      prefs.showTags
    );
    const responses = await Promise.all(
      effectiveQueries.map((effective) => this.fetchEffectivePage(effective, sort, page))
    );
    return this.toPagedList(mergeResponses(responses, sort), page, prefs, cdn);
  }

  private async fetchEffectivePage(
    effective: EffectiveQuery,
    sort: SortKey,
    page: number
  ): Promise<NhentaiPaginatedResponse> {
    if (effective.kind === "all") {
      return sort === "date"
        ? this.fetchList("/galleries", { page })
        : this.fetchList("/search", { query: "*", sort, page });
    }
    if (effective.kind === "singleTag") {
      const tagKey = `${effective.term.ns}:${effective.term.value}`;
      const tagId = this.tagIds.get(tagKey);
      if (tagId !== undefined) {
        return this.fetchList("/galleries/tagged", { tag_id: tagId, sort, page });
      }
    }
    return this.fetchList("/search", { query: effective.query, sort, page });
  }

  private async fetchFavorites(page: number): Promise<PagedItemList> {
    const [prefs, cdn] = await Promise.all([loadPreferences(), this.cdnConfig()]);
    if (!prefs.apiKey) {
      throw new Error("Configure an nhentai API key in Settings to view Favorites.");
    }
    const response = await this.fetchList("/favorites", { page });
    // Favorites aren't query-filtered, so apply the whitelist with tag ids here.
    const showTagIds = await this.resolveShowTagIds(prefs.showTags);
    return this.toPagedList(response, page, prefs, cdn, showTagIds);
  }

  private toPagedList(
    response: NhentaiPaginatedResponse,
    page: number,
    prefs: Preferences,
    cdn: CdnConfig,
    showTagIds?: Set<number>
  ): PagedItemList {
    const perPage = response.per_page || PAGE_SIZE;
    const numPages = response.num_pages ?? 0;
    const rawItems = response.result ?? [];
    const hiddenTagIds = this.resolveKnownHiddenTagIds(prefs);

    const items = rawItems
      .filter((item) =>
        isListItemVisible(
          item,
          prefs,
          hiddenTagIds,
          showTagIds,
          prefs.showTags.length > 0 && showTagIds !== undefined
        )
      )
      .map((item) => toItem(item, this.language, cdn, prefs.titleDisplay));

    let total: number;
    if (typeof response.total === "number") {
      total = response.total;
    } else if (numPages <= 0) {
      total = 0;
    } else if (page < numPages) {
      total = numPages * perPage;
    } else {
      total = (numPages - 1) * perPage + rawItems.length;
    }

    return {
      items,
      total,
      isLastPage: numPages <= 0 || page >= numPages || rawItems.length === 0,
    };
  }

  /** Tags discovered while browsing become selectable in the Hidden Tags setting. */
  private discoveredTagOptions(): LabeledOption[] {
    const options: LabeledOption[] = [];
    for (const key of this.tagIds.keys()) {
      const colon = key.indexOf(":");
      if (colon <= 0) continue;
      const id = hiddenTagId(key.slice(0, colon), key.slice(colon + 1));
      options.push({ id, title: humanizeHiddenTag(id) });
    }
    return options;
  }

  private resolveKnownHiddenTagIds(prefs: Preferences): Set<number> {
    const ids = new Set<number>();
    for (const entry of prefs.hiddenTags) {
      const key = entry.includes(":") ? entry : `tag:${entry}`;
      const id = this.tagIds.get(key);
      if (id !== undefined) ids.add(id);
    }
    return ids;
  }

  /** Resolves a `type:name` key to a tag id, falling back to the tag endpoint. */
  private async resolveTagId(key: string): Promise<number | null> {
    if (this.resolvedTagIds.has(key)) return this.resolvedTagIds.get(key) ?? null;
    const known = this.tagIds.get(key);
    if (known !== undefined) {
      this.resolvedTagIds.set(key, known);
      return known;
    }
    const colon = key.indexOf(":");
    const type = colon > 0 ? key.slice(0, colon) : "tag";
    const slug = (colon > 0 ? key.slice(colon + 1) : key).trim().replace(/\s+/g, "-");
    let id: number | null = null;
    if (slug) {
      try {
        const tag = await this.requestJson<{ id: number }>(
          `/tags/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
          {}
        );
        if (typeof tag?.id === "number") id = tag.id;
      } catch {
        // Unknown tags simply don't match the whitelist.
      }
    }
    this.resolvedTagIds.set(key, id);
    if (id !== null) this.tagIds.set(key, id);
    return id;
  }

  private async resolveShowTagIds(entries: string[]): Promise<Set<number>> {
    const ids = new Set<number>();
    await Promise.all(
      entries.map(async (entry) => {
        const key = entry.includes(":") ? entry : `tag:${entry}`;
        const id = await this.resolveTagId(key);
        if (id !== null) ids.add(id);
      })
    );
    return ids;
  }

  private async fetchList(
    path: string,
    params: Record<string, string | number>
  ): Promise<NhentaiPaginatedResponse> {
    const cacheKey = JSON.stringify([path, params]);
    const cached = this.listCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < LIST_CACHE_TTL_MS) {
      return cached.data;
    }

    const data = await this.requestJson<NhentaiPaginatedResponse>(path, params);
    this.listCache.set(cacheKey, { data, fetchedAt: Date.now() });
    trim(this.listCache, LIST_CACHE_SIZE);
    return data;
  }

  private async fetchGallery(
    id: string,
    includeRelated: boolean
  ): Promise<NhentaiGalleryDetail> {
    const cached = this.galleries.get(id);
    if (cached && (!includeRelated || Array.isArray(cached.related))) {
      return cached;
    }

    const params: Record<string, string> = includeRelated
      ? { include: "related" }
      : {};
    const gallery = await this.requestJson<NhentaiGalleryDetail>(
      `/galleries/${encodeURIComponent(id)}`,
      params,
      `Gallery ${id} is no longer available on nhentai.`
    );

    for (const tag of gallery.tags ?? []) {
      if (tag?.type && tag?.name && typeof tag.id === "number") {
        this.tagIds.set(`${tag.type}:${tag.name.toLowerCase()}`, tag.id);
      }
    }
    trim(this.tagIds, TAG_CACHE_SIZE);

    this.galleries.set(id, gallery);
    trim(this.galleries, GALLERY_CACHE_SIZE);
    return gallery;
  }

  private async cdnConfig(): Promise<CdnConfig> {
    const cached = this.cdnState;
    if (cached && Date.now() - cached.fetchedAt < CDN_TTL_MS) {
      return cached.config;
    }
    try {
      const data = await this.requestJson<CdnConfig>("/cdn", {});
      if (
        Array.isArray(data.image_servers) &&
        data.image_servers.length > 0 &&
        Array.isArray(data.thumb_servers) &&
        data.thumb_servers.length > 0
      ) {
        this.cdnState = { config: data, fetchedAt: Date.now() };
        return data;
      }
    } catch {
      // Fall back to the known CDN hosts if the config endpoint is unreachable.
    }
    return cached?.config ?? DEFAULT_CDN;
  }

  /** Loads the API key once and caches it for subsequent requests. */
  private async getApiKey(): Promise<string | null> {
    if (this.apiKey === undefined) {
      this.apiKey = await loadApiKey();
    }
    return this.apiKey;
  }

  private async requestJson<T>(
    path: string,
    params: Record<string, string | number>,
    notFoundMessage?: string
  ): Promise<T> {
    const headers: Record<string, string> = {};
    const apiKey = await this.getApiKey();
    if (apiKey) {
      headers["Authorization"] = `Key ${apiKey}`;
    }

    let response = await this.client.get(path, {
      params,
      headers,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 429) {
      const retryAfter = parseInt(
        response.headers.get("retry-after") ?? "3",
        10
      );
      const delayMs =
        Math.min(Math.max(Number.isFinite(retryAfter) ? retryAfter : 3, 1), 10) *
        1000;
      await sleep(delayMs);
      response = await this.client.get(path, {
        params,
        headers,
        validateStatus: (status) => status < 500,
      });
    }

    if (response.status === 404) {
      throw new Error(
        notFoundMessage ?? "Requested resource was not found on nhentai."
      );
    }
    if (response.status === 401) {
      throw new Error("Invalid or revoked nhentai API key. Check your Settings.");
    }
    if (response.status === 429) {
      throw new Error("nhentai rate limit reached. Please wait a moment.");
    }
    if (!response.ok) {
      throw new Error(`nhentai API request failed (${response.status}).`);
    }

    return response.json<T>();
  }
}

/**
 * Combines one response per show tag into a single page. Show tags are OR-ed,
 * so the same gallery can appear in several responses and must be de-duplicated.
 */
function mergeResponses(
  responses: NhentaiPaginatedResponse[],
  sort: SortKey
): NhentaiPaginatedResponse {
  if (responses.length === 1) return responses[0];
  const lists = responses.map((r) => r.result ?? []);
  const byId = new Map<number, NhentaiListItem>();

  if (sort === "date") {
    // nhentai ids grow with upload time, so date order is descending id order.
    for (const item of lists.flat()) byId.set(item.id, item);
    return {
      result: [...byId.values()].sort((a, b) => b.id - a.id).slice(0, PAGE_SIZE),
      num_pages: Math.max(0, ...responses.map((r) => r.num_pages ?? 0)),
      per_page: PAGE_SIZE,
      total: responses.reduce((sum, r) => sum + (r.total ?? 0), 0),
    };
  }

  // Popularity lists have no common numeric key; interleave them by rank.
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const item = list[i];
      if (item && !byId.has(item.id)) byId.set(item.id, item);
    }
  }

  return {
    result: [...byId.values()].slice(0, PAGE_SIZE),
    num_pages: Math.max(0, ...responses.map((r) => r.num_pages ?? 0)),
    per_page: PAGE_SIZE,
    total: responses.reduce((sum, r) => sum + (r.total ?? 0), 0),
  };
}

/** Waits if the runtime provides timers; otherwise resolves immediately. */
function sleep(ms: number): Promise<void> {
  const setTimer = (globalThis as any).setTimeout;
  return typeof setTimer === "function"
    ? new Promise((resolve) => setTimer(resolve, ms))
    : Promise.resolve();
}

function trim<K, V>(map: Map<K, V>, size: number) {
  while (map.size > size) map.delete(map.keys().next().value as K);
}
