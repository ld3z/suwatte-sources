"use httpclient";

import {
  Chapter,
  ChapterPage,
  ChapterUnavailableError,
  Content,
  Cookie,
  Delegate,
  HomePage,
  HttpRequest,
  HttpResponse,
  Item,
  ItemListRequest,
  PagedItemList,
  PickerFilter,
  SearchFilter,
  SearchRequest,
  SelectFilter,
  SourceConfiguration,
  SourceInfo,
  SourceVariant,
  TextFilter,
  ToggleFilter,
  UIForm,
} from "@suwatte/toolchain";

import {
  // ACCOUNT_FEEDS,
  ALL_LANGUAGES,
  ALL_VARIANT_FEEDS,
  API_URL,
  CATEGORY_OPTIONS,
  EH_BASE_URL,
  // EX_BASE_URL,
  GALLERY_CACHE_TTL_MS,
  IMAGE_URL_TTL_MS,
  LANGUAGE_OPTIONS,
  LANG_VARIANT_FEEDS,
  MIN_RATING_OPTIONS,
  QUERY_LIST_PREFIX,
  SOURCE_CONFIG,
  USER_AGENT,
} from "./constants";
import { info, variants } from "./info";
import {
  gmetadataToGalleryPage,
  gmetadataToItem,
  isGalleryUnavailableHtml,
  isListingItemVisible,
  listingItemToSuwatteItem,
  parseContentId,
  parseGalleryIdFromReader,
  parseGalleryPage,
  parseListingPage,
  parseReaderPage,
  parseViewerLinks,
  toChapter,
  toContent,
} from "./parsers";
import { SearchOptions, buildSearchOptions, parseDeepLink } from "./search";
import {
  Preferences,
  baseUrlFor,
  buildSettingsForm,
  loadPreferences,
  savePreferences,
} from "./settings";
import {
  EHentaiGDataResponse,
  EHentaiGMetadata,
  ParsedGalleryPage,
  ResolvedReaderImage,
} from "./types";

const VIEWER_PAGE_URL_RE =
  /^https?:\/\/(?:e-hentai|exhentai)\.org(\/s\/[0-9a-f]{10}\/\d+-\d+)(?:[/?#]|$)/i;

const CURSOR_CACHE_SIZE = 128;
const GALLERY_CACHE_SIZE = 64;
const IMAGE_CACHE_SIZE = 500;

export default class EHentai implements Delegate {
  static info: SourceInfo = info;
  static variants: SourceVariant[] = variants;

  /**
   * Suwatte routes cover and page image requests through `this.client` when
   * `useClientForImageRequests` is enabled. Viewer URLs (`/s/...`) are lazily
   * resolved to fresh H@H image URLs right before dispatch.
   */
  client = new HttpClient({
    timeout: 30_000,
    retries: 2,
    rateLimit: {
      permits: 12,
      period: 1,
    },
    headers: {
      "User-Agent": USER_AGENT,
      Referer: `${EH_BASE_URL}/`,
    },
  });

  /** Separate rate-limited HTML/API client so browsing and H@H resolution stay polite. */
  private web = new HttpClient({
    cloudflareResolutionURL: EH_BASE_URL,
    timeout: 30_000,
    retries: 2,
    rateLimit: {
      permits: 4,
      period: 1,
    },
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.8",
    },
  });

  private readonly language: string;
  private nextCursors = new Map<string, string>();
  private galleryCache = new Map<
    string,
    { page: ParsedGalleryPage; fromApiFallback: boolean; fetchedAt: number }
  >();
  private resolvedPages = new Map<string, ResolvedReaderImage>();
  /** Maps resolved H@H image URLs back to their `/s/...` path and `nl` retry key. */
  private nlFallbacks = new Map<
    string,
    { viewerPath: string; nlToken: string }
  >();

  constructor(args?: Record<string, unknown>) {
    const language = args?.language;
    this.language =
      typeof language === "string" && language ? language : ALL_LANGUAGES;

    this.client.interceptors.request.use((req) =>
      this.interceptImageRequest(req)
    );
    this.client.interceptors.response.use((res) =>
      this.interceptImageResponse(res)
    );
  }

  getConfiguration(): SourceConfiguration {
    return SOURCE_CONFIG;
  }

  // =============================== Home Page ===============================

  async getHomePage(): Promise<HomePage> {
    const feeds =
      this.language === ALL_LANGUAGES ? ALL_VARIANT_FEEDS : LANG_VARIANT_FEEDS;
    // TODO: Revisit account feeds (Watched / Favorites) later
    // const prefs = await loadPreferences();
    // const feeds = prefs.account ? [...baseFeeds, ...ACCOUNT_FEEDS] : baseFeeds;

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
    const prefs = await loadPreferences();
    const key = request.key ?? "latest";

    if (key.startsWith(QUERY_LIST_PREFIX)) {
      const query = key.slice(QUERY_LIST_PREFIX.length);
      return this.fetchCursorListing(
        buildSearchOptions({ query }, this.language, prefs),
        page,
        prefs
      );
    }

    if (key === "popular") {
      if (page > 1) return { items: [], isLastPage: true };
      const html = await this.fetchSiteHtml("/popular", {}, prefs);
      const parsed = parseListingPage(html);
      const baseUrl = baseUrlFor(prefs);
      return {
        items: parsed.items
          .filter((item) => isListingItemVisible(item, prefs))
          .map((item) =>
            listingItemToSuwatteItem(item, this.language, prefs, baseUrl)
          ),
        isLastPage: true,
      };
    }

    const toplistFeed = ALL_VARIANT_FEEDS.find(
      (f) => f.id === key && f.tl !== undefined
    );
    if (toplistFeed?.tl !== undefined) {
      const params: Record<string, number> = { tl: toplistFeed.tl };
      if (page > 1) params.p = page - 1;
      const html = await this.fetchSiteHtml(
        `${EH_BASE_URL}/toplist.php`,
        params,
        prefs
      );
      const parsed = parseListingPage(html);
      const baseUrl = baseUrlFor(prefs);
      return {
        items: parsed.items
          .filter((item) => isListingItemVisible(item, prefs))
          .map((item) =>
            listingItemToSuwatteItem(item, this.language, prefs, baseUrl)
          ),
        isLastPage: !parsed.hasNextPage || parsed.items.length === 0,
      };
    }

    // TODO: Revisit account feeds (Watched / Favorites) later
    // if (key === "watched") {
    //   return this.fetchCursorListing(
    //     buildSearchOptions({}, this.language, prefs, "/watched"),
    //     page,
    //     prefs
    //   );
    // }
    // if (key === "favorites") {
    //   return this.fetchCursorListing(
    //     buildSearchOptions({}, this.language, prefs, "/favorites.php"),
    //     page,
    //     prefs
    //   );
    // }

    if (key === "rated_4") {
      return this.fetchCursorListing(
        buildSearchOptions(
          { filters: { min_rating: "4" } },
          this.language,
          prefs
        ),
        page,
        prefs
      );
    }

    if (key === "doujinshi" || key === "manga") {
      return this.fetchCursorListing(
        buildSearchOptions(
          { filters: { category: { include: [key], exclude: [] } } },
          this.language,
          prefs
        ),
        page,
        prefs
      );
    }

    return this.fetchCursorListing(
      buildSearchOptions({}, this.language, prefs),
      page,
      prefs
    );
  }

  // =============================== Search ===============================

  async getSearchFilters(): Promise<SearchFilter[]> {
    const filters: SearchFilter[] = [
      SearchFilter("category", "Category", SelectFilter(CATEGORY_OPTIONS, true)),
      SearchFilter(
        "tags",
        "Tags",
        TextFilter(),
        "Comma-separated; e.g. female:big breasts, full color, -male:yaoi"
      ),
      SearchFilter(
        "artists",
        "Artists",
        TextFilter(),
        "Comma-separated; several match any"
      ),
      SearchFilter(
        "groups",
        "Groups",
        TextFilter(),
        "Comma-separated; several match any"
      ),
      SearchFilter(
        "parodies",
        "Parodies",
        TextFilter(),
        "Comma-separated; e.g. touhou project, original"
      ),
      SearchFilter("characters", "Characters", TextFilter(), "Comma-separated"),
      SearchFilter("uploader", "Uploader", TextFilter(), "Exact uploader name"),
      SearchFilter(
        "min_rating",
        "Minimum Rating",
        PickerFilter(MIN_RATING_OPTIONS)
      ),
      SearchFilter("pages", "Pages", TextFilter(), "e.g. >=20, 20-100, <=50"),
      SearchFilter("torrents_only", "Require Torrent", ToggleFilter()),
      SearchFilter("expunged", "Browse Expunged Galleries", ToggleFilter()),
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
    const deepLink = parseDeepLink(request.query ?? "");
    if (deepLink && page === 1) {
      try {
        const contentId =
          deepLink.kind === "gallery"
            ? deepLink.id
            : await this.resolveReaderDeepLink(deepLink.path, prefs);
        if (contentId) {
          const { page: gallery } = await this.loadGallery(contentId, prefs);
          const baseUrl = baseUrlFor(prefs);
          const content = toContent(gallery, contentId, prefs, [], baseUrl);
          return {
            items: [
              {
                id: contentId,
                title: content.title,
                subtitle: [
                  content.additionalDetails?.["Category"],
                  this.language === ALL_LANGUAGES
                    ? content.additionalDetails?.["Language"]
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined,
                coverImage: content.coverImage,
                webUrl: content.webUrl,
                statistics: content.statistics,
                rating: content.rating,
              },
            ],
            total: 1,
            isLastPage: true,
          };
        }
      } catch {
        // Fall back to a regular search if the deep link could not be loaded.
      }
    }

    return this.fetchCursorListing(
      buildSearchOptions(request, this.language, prefs),
      page,
      prefs
    );
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    const prefs = await loadPreferences();
    const { page: gallery } = await this.loadGallery(contentId, prefs);
    const baseUrl = baseUrlFor(prefs);

    let relatedItems: Item[] = [];
    if (gallery.relatedRefs.length > 0) {
      const metas = await this.fetchGMetadata(
        gallery.relatedRefs.slice(0, 25)
      );
      relatedItems = metas.map((m) =>
        gmetadataToItem(m, this.language, prefs, baseUrl)
      );
    }

    return toContent(gallery, contentId, prefs, relatedItems, baseUrl);
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    const prefs = await loadPreferences();
    const { page: gallery } = await this.loadGallery(contentId, prefs);
    return [toChapter(gallery, contentId, baseUrlFor(prefs))];
  }

  async getChapterPages(
    contentId: string,
    _chapterId: string
  ): Promise<ChapterPage[]> {
    const prefs = await loadPreferences();
    const { page: gallery, fromApiFallback } = await this.loadGallery(
      contentId,
      prefs
    );

    if (fromApiFallback || gallery.viewerUrls.size === 0) {
      throw new ChapterUnavailableError(
        "This gallery is unavailable on e-hentai.org (it may be expunged or restricted to ExHentai)."
      );
    }

    const viewerUrls = new Map(gallery.viewerUrls);
    if (gallery.totalThumbPages > 1) {
      const { gid, token } = parseContentId(contentId);
      const extraIndices = Array.from(
        { length: gallery.totalThumbPages - 1 },
        (_, i) => i + 1
      );
      const htmlPages = await Promise.all(
        extraIndices.map((p) =>
          this.fetchSiteHtml(`/g/${gid}/${token}/`, { p }, prefs)
        )
      );
      for (const html of htmlPages) {
        for (const [pageNum, url] of parseViewerLinks(html)) {
          viewerUrls.set(pageNum, url);
        }
      }
    }

    const ordered = [...viewerUrls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, url]) => ({ url }));

    if (ordered.length === 0) {
      throw new ChapterUnavailableError(
        `No readable pages found for gallery ${contentId}.`
      );
    }
    return ordered;
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
    this.galleryCache.clear();
    this.nextCursors.clear();
    this.resolvedPages.clear();
  }

  // ========================== Image Interceptors ==========================

  private async interceptImageRequest(
    request: HttpRequest
  ): Promise<HttpRequest> {
    const prefs = await loadPreferences();
    const siteOrigin = baseUrlFor(prefs);

    const viewerMatch = VIEWER_PAGE_URL_RE.exec(request.url);
    if (viewerMatch) {
      const viewerPath = viewerMatch[1];
      const resolved = await this.resolveViewerPage(viewerPath, prefs);
      // const targetUrl =
      //   prefs.originalImages && prefs.account && resolved.fullImageUrl
      //     ? resolved.fullImageUrl
      //     : resolved.imageUrl;
      const targetUrl = resolved.imageUrl;

      if (resolved.nlToken) {
        this.nlFallbacks.set(targetUrl, {
          viewerPath,
          nlToken: resolved.nlToken,
        });
        trim(this.nlFallbacks, IMAGE_CACHE_SIZE);
      }

      request.url = targetUrl;
      request.params = {};
    }

    request.headers.set(
      "Accept",
      "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8"
    );
    request.headers.set("Referer", `${siteOrigin}/`);

    // TODO: Revisit account cookies on image requests later
    // if (
    //   prefs.account &&
    //   /(?:e-hentai|exhentai)\.org\//i.test(request.url)
    // ) {
    //   request.cookies.push(...this.cookiesFor(prefs, false));
    // }

    return request;
  }

  private async interceptImageResponse(
    response: HttpResponse
  ): Promise<HttpResponse> {
    if (response.ok) return response;

    const fallback = this.nlFallbacks.get(response.request.url);
    if (!fallback) return response;
    this.nlFallbacks.delete(response.request.url);

    try {
      const prefs = await loadPreferences();
      const html = await this.fetchSiteHtml(
        fallback.viewerPath,
        { nl: fallback.nlToken },
        prefs
      );
      const refreshed = parseReaderPage(html);
      this.resolvedPages.set(
        `${baseUrlFor(prefs)}${fallback.viewerPath}`,
        refreshed
      );
      const retry = await this.web.get(refreshed.imageUrl, {
        headers: {
          Accept:
            "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
          Referer: `${baseUrlFor(prefs)}/`,
        },
        validateStatus: () => true,
      });
      if (retry.ok) {
        return response.rebuild({
          status: retry.status,
          headers: retry.headers.toJSON(),
          body: await retry.bytes(),
        });
      }
    } catch {
      // Return original failed response if alternate H@H node lookup also fails.
    }

    return response;
  }

  private async resolveViewerPage(
    viewerPath: string,
    prefs: Preferences
  ): Promise<ResolvedReaderImage> {
    const cacheKey = `${baseUrlFor(prefs)}${viewerPath}`;
    const cached = this.resolvedPages.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < IMAGE_URL_TTL_MS) {
      return cached;
    }

    const html = await this.fetchSiteHtml(viewerPath, {}, prefs);
    const resolved = parseReaderPage(html);
    this.resolvedPages.set(cacheKey, resolved);
    trim(this.resolvedPages, IMAGE_CACHE_SIZE);
    return resolved;
  }

  // =============================== Helpers ===============================

  private async fetchCursorListing(
    options: SearchOptions,
    page: number,
    prefs: Preferences
  ): Promise<PagedItemList> {
    const baseUrl = baseUrlFor(prefs);
    const queryId = JSON.stringify([baseUrl, options.path, options.params]);
    const params: Record<string, string | number> = { ...options.params };

    if (page > 1) {
      let cursor = this.nextCursors.get(`${queryId}#${page}`);
      if (!cursor && page <= 5) {
        // Walk forward from the closest cached page if a page was requested out of order.
        let startPage = page - 1;
        while (startPage > 1 && !this.nextCursors.has(`${queryId}#${startPage}`)) {
          startPage -= 1;
        }
        for (let p = startPage; p < page; p++) {
          const stepParams: Record<string, string | number> = {
            ...options.params,
          };
          if (p > 1) {
            const prevCursor = this.nextCursors.get(`${queryId}#${p}`);
            if (!prevCursor) break;
            stepParams.next = prevCursor;
          }
          const stepHtml = await this.fetchSiteHtml(
            options.path,
            stepParams,
            prefs
          );
          const stepParsed = parseListingPage(stepHtml);
          if (!stepParsed.nextCursor) break;
          this.nextCursors.set(`${queryId}#${p + 1}`, stepParsed.nextCursor);
          trim(this.nextCursors, CURSOR_CACHE_SIZE);
        }
        cursor = this.nextCursors.get(`${queryId}#${page}`);
      }

      if (!cursor) {
        return { items: [], isLastPage: true };
      }
      params.next = cursor;
    }

    const html = await this.fetchSiteHtml(options.path, params, prefs);
    const parsed = parseListingPage(html);
    if (parsed.nextCursor) {
      this.nextCursors.set(`${queryId}#${page + 1}`, parsed.nextCursor);
      trim(this.nextCursors, CURSOR_CACHE_SIZE);
    }

    return {
      items: parsed.items
        .filter((item) => isListingItemVisible(item, prefs))
        .map((item) =>
          listingItemToSuwatteItem(item, this.language, prefs, baseUrl)
        ),
      total: parsed.total,
      isLastPage: !parsed.hasNextPage || parsed.items.length === 0,
    };
  }

  private async loadGallery(
    contentId: string,
    prefs: Preferences
  ): Promise<{ page: ParsedGalleryPage; fromApiFallback: boolean }> {
    const baseUrl = baseUrlFor(prefs);
    const cacheKey = `${baseUrl}:${contentId}`;
    const cached = this.galleryCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < GALLERY_CACHE_TTL_MS) {
      return { page: cached.page, fromApiFallback: cached.fromApiFallback };
    }

    const { gid, token } = parseContentId(contentId);
    const response = await this.requestSite(
      `/g/${gid}/${token}/`,
      { hc: 1 },
      prefs,
      false
    );
    const html = await response.text();

    if (response.status === 404 || isGalleryUnavailableHtml(html)) {
      const metas = await this.fetchGMetadata([
        { gid: parseInt(gid, 10), token },
      ]);
      if (metas.length > 0 && !metas[0].expunged) {
        const fallbackPage = gmetadataToGalleryPage(metas[0]);
        this.galleryCache.set(cacheKey, {
          page: fallbackPage,
          fromApiFallback: true,
          fetchedAt: Date.now(),
        });
        trim(this.galleryCache, GALLERY_CACHE_SIZE);
        return { page: fallbackPage, fromApiFallback: true };
      }
      throw new Error(
        `Gallery ${contentId} has been removed or is unavailable on E-Hentai.`
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to load gallery ${contentId} (${response.status}).`
      );
    }

    const parsed = parseGalleryPage(html, contentId);
    this.galleryCache.set(cacheKey, {
      page: parsed,
      fromApiFallback: false,
      fetchedAt: Date.now(),
    });
    trim(this.galleryCache, GALLERY_CACHE_SIZE);
    return { page: parsed, fromApiFallback: false };
  }

  private async resolveReaderDeepLink(
    readerPath: string,
    prefs: Preferences
  ): Promise<string | null> {
    const html = await this.fetchSiteHtml(readerPath, {}, prefs);
    return parseGalleryIdFromReader(html);
  }

  private async fetchGMetadata(
    gidList: { gid: number; token: string }[]
  ): Promise<EHentaiGMetadata[]> {
    if (gidList.length === 0) return [];
    try {
      const response = await this.web.post(API_URL, {
        method: "gdata",
        gidlist: gidList.map(({ gid, token }) => [gid, token]),
        namespace: 1,
      });
      const data = await response.json<EHentaiGDataResponse>();
      return (data.gmetadata ?? []).filter((m) => !m.error);
    } catch {
      return [];
    }
  }

  private cookiesFor(_prefs: Preferences, forceExtendedList: boolean): Cookie[] {
    const cookies: Cookie[] = [{ name: "nw", value: "1" }];
    if (forceExtendedList) {
      cookies.push({ name: "sl", value: "dm_2" });
    }
    // TODO: Revisit account & ExHentai cookies later
    // if (_prefs.account) {
    //   cookies.push(
    //     { name: "ipb_member_id", value: _prefs.account.memberId },
    //     { name: "ipb_pass_hash", value: _prefs.account.passHash }
    //   );
    //   if (_prefs.account.igneous) {
    //     cookies.push({ name: "igneous", value: _prefs.account.igneous });
    //   }
    // }
    return cookies;
  }

  private async requestSite(
    pathOrUrl: string,
    params: Record<string, string | number>,
    prefs: Preferences,
    isListing: boolean
  ): Promise<HttpResponse> {
    const baseUrl = baseUrlFor(prefs);
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : `${baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;

    const response = await this.web.get(url, {
      params,
      cookies: this.cookiesFor(prefs, isListing),
      headers: {
        Referer: `${baseUrl}/`,
      },
      validateStatus: (status) => status < 500,
    });

    // TODO: Revisit ExHentai Sad Panda check later
    // const contentType = response.headers.get("content-type") ?? "";
    // if (url.startsWith(EX_BASE_URL) && contentType.startsWith("image/")) {
    //   throw new Error(
    //     "ExHentai denied access (Sad Panda). Verify your ipb_member_id, ipb_pass_hash, and igneous cookies in Settings."
    //   );
    // }

    return response;
  }

  private async fetchSiteHtml(
    pathOrUrl: string,
    params: Record<string, string | number>,
    prefs: Preferences
  ): Promise<string> {
    const isListing = !/\/(?:g|s)\//.test(pathOrUrl);
    const response = await this.requestSite(
      pathOrUrl,
      params,
      prefs,
      isListing
    );
    if (!response.ok) {
      throw new Error(
        `E-Hentai request failed (${response.status}): ${galleryWebUrlSafe(pathOrUrl)}`
      );
    }
    const html = await response.text();
    if (html.includes("Your IP address has been temporarily banned")) {
      throw new Error(
        "E-Hentai has temporarily banned this IP address due to excessive load."
      );
    }
    return html;
  }
}

function galleryWebUrlSafe(pathOrUrl: string): string {
  return /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${EH_BASE_URL}${pathOrUrl}`;
}

function trim<K, V>(map: Map<K, V>, size: number) {
  while (map.size > size) map.delete(map.keys().next().value as K);
}
