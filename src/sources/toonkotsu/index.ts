"use httpclient";

import {
  Chapter,
  ChapterPage,
  Content,
  Delegate,
  HomePage,
  HttpResponse,
  ItemListRequest,
  PagedItemList,
  SearchFilter,
  SearchRequest,
  SortOptions,
  SourceConfiguration,
  SourceInfo,
  UIForm,
} from "@suwatte/toolchain";

import {
  BASE_URL,
  CatalogueParams,
  FeedDefinition,
  FEEDS,
  PAGE_SIZE,
  READER_BUILD,
  SORT_OPTIONS,
} from "./constants";
import { decodeBase64Url, decryptPage, deriveReaderKey, ReaderKey, signReaderPath } from "./crypto";
import { info } from "./info";
import {
  PAGE_KEY,
  PAGE_NONCE,
  parseChapterPages,
  parseDeepLinkId,
  parseRatingId,
  parseReaderKeyResponse,
  parseTagGroups,
  toChapters,
  toContent,
  toItems,
  toLatestItems,
} from "./parsers";
import {
  buildBrowseParams,
  buildSearchFilters,
  catalogueParams,
  hasNextPage,
  searchRatings,
  toQueryParams,
} from "./search";
import {
  buildSettingsForm,
  loadPreferences,
  Preferences,
  savePreferences,
  VERIFY_BUTTON_TITLE,
} from "./settings";
import {
  FacetsResponse,
  LatestResponse,
  ReaderKeyResponse,
  ReaderLimit,
  Series,
  SeriesListResponse,
  SeriesResponse,
} from "./types";

const API_PATH_REGEX = /\/(?:api|cdn\/v1)\//;
const IMAGE_REGEX = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
/** Lets refused reader requests through so their status and body can be inspected. */
const acceptAnyStatus = () => true;

type ReaderSession = { readerKey: ReaderKey; response: ReaderKeyResponse };

export default class Toonkotsu implements Delegate {
  static info: SourceInfo = info;

  client = new HttpClient({
    baseUrl: BASE_URL,
    rateLimit: {
      permits: 5,
      period: 1,
    },
    cloudflareResolutionURL: `${BASE_URL}/`,
  });

  private facetsPromise?: Promise<FacetsResponse>;
  private readerSession?: Promise<ReaderSession>;
  /**
   * The reader refuses requests without the site's guest session cookie, which
   * is only handed out by `/api/auth/me`, the call the site's pages make on load.
   */
  private siteSession?: Promise<void>;
  /** Titles already listed in Latest Updates, so a later page does not repeat them. */
  private latestSeen = new Set<number>();

  constructor() {
    this.client.interceptors.request.use((request) => {
      const isApi = API_PATH_REGEX.test(request.url);
      const isImage = !!request.context?.[PAGE_KEY] || IMAGE_REGEX.test(request.url);
      request.headers.set(
        "Accept",
        isApi
          ? "application/json"
          : isImage
            ? "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8"
            : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      );
      if (isApi) request.headers.set("Origin", BASE_URL);
      request.headers.set("Referer", `${BASE_URL}/`);
      return request;
    });

    this.client.interceptors.response.use((response) => {
      // The API answers in JSON and can't show the challenge; solving it on the site clears the domain.
      if (response.headers.get("cf-mitigated")?.toLowerCase() === "challenge") {
        throw new CloudflareError(`${BASE_URL}/`);
      }
      return this.decryptPageResponse(response);
    });
  }

  getConfiguration(): SourceConfiguration {
    return {
      imageReferer: `${BASE_URL}/`,
      useClientForImageRequests: true,
    };
  }

  // =============================== Home Page ===============================

  async getHomePage(): Promise<HomePage> {
    const hidden = new Set((await loadPreferences()).hiddenFeeds);
    return {
      feeds: FEEDS.filter((feed) => !hidden.has(feed.id)).map((feed) => ({
        id: feed.id,
        title: feed.title,
        content: { list: { key: feed.id } },
      })),
    };
  }

  // ============================== Item List ===============================

  async getItemList(request: ItemListRequest, page: number): Promise<PagedItemList> {
    const prefs = await loadPreferences();
    const feed = FEEDS.find((f) => f.id === request.key) ?? FEEDS[0];
    const ratings = prefs.contentRatings;
    const allowed = (series: Series) => ratings.includes(parseRatingId(series));
    const params = catalogueParams(prefs, ratings);

    if (feed.source.kind === "latest") {
      if (page === 1) this.latestSeen.clear();
      const data = await this.getJson<LatestResponse>("/cdn/v1/latest", {
        ...params,
        page,
        limit: PAGE_SIZE,
      });
      // The feed lists every new chapter, but the site shows each title once, at its newest.
      const items = data.items.filter(({ series }) => {
        if (this.latestSeen.has(series.id)) return false;
        this.latestSeen.add(series.id);
        return allowed(series);
      });
      return { items: toLatestItems(items), isLastPage: !data.hasNextPage };
    }

    const data = await this.loadFeed(feed, params, page);
    return {
      items: toItems(data.items.filter(allowed)),
      isLastPage: !hasNextPage(data, page),
    };
  }

  private loadFeed(
    feed: FeedDefinition,
    params: CatalogueParams,
    page: number
  ): Promise<SeriesListResponse> {
    switch (feed.source.kind) {
      case "reading":
        return this.getJson("/api/v1/rankings", {
          limit: PAGE_SIZE,
          ...params,
          metric: feed.source.metric,
          sort: "latest",
          order: "desc",
          page,
        });
      case "discovery":
        // Discovery rankings are posted as the browse parameters.
        return this.postJson("/api/v1/rankings", {
          params: {
            limit: PAGE_SIZE,
            ...params,
            page,
            discovery: feed.source.metric,
            metric: feed.source.metric,
          },
        });
      case "browse":
        return this.getJson("/cdn/v1/browse", {
          limit: PAGE_SIZE,
          ...params,
          ...feed.source.params,
          page,
        });
      default:
        return Promise.resolve({ items: [] });
    }
  }

  // =============================== Search ===============================

  async getSortOptions(): Promise<SortOptions> {
    return { options: SORT_OPTIONS };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    const prefs = await loadPreferences();
    return buildSearchFilters(await this.getTagGroups(prefs.contentRatings));
  }

  async getSearchResults(request: SearchRequest, page: number): Promise<PagedItemList> {
    const deepLinkId = parseDeepLinkId(request.query?.trim() ?? "");
    if (deepLinkId) {
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
      } catch (error) {
        if (error instanceof CloudflareError) throw error;
        // Fall back to a normal search if the direct lookup fails.
      }
    }

    const prefs = await loadPreferences();
    const ratings = searchRatings(request, prefs);
    const tagGroups = await this.getTagGroups(ratings);
    const data = await this.getJson<SeriesListResponse>(
      "/cdn/v1/browse",
      buildBrowseParams(request, page, prefs, tagGroups)
    );
    return {
      items: toItems(data.items.filter((series) => ratings.includes(parseRatingId(series)))),
      total: data.total,
      isLastPage: !hasNextPage(data, page),
    };
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    const [series, facets] = await Promise.all([
      this.getSeries(contentId),
      this.getFacets().catch((): FacetsResponse => ({})),
    ]);
    return toContent(series, contentId, facets);
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    return toChapters(await this.getSeries(contentId));
  }

  /**
   * Chapter requests are signed with a key from `/api/manga/key`. A rejected
   * signature usually means the key expired, so it is refreshed once.
   */
  async getChapterPages(_contentId: string, chapterId: string): Promise<ChapterPage[]> {
    const path = `/api/manga/chapter/${chapterId}`;
    for (let attempt = 0; ; attempt++) {
      const { readerKey, response } = await this.getReaderSession(chapterId);
      const result = await this.client.get(path, {
        headers: { "x-sig": signReaderPath(readerKey, path) },
        validateStatus: acceptAnyStatus,
      });
      if (result.ok) {
        return parseChapterPages(await result.json(), readerKey);
      }

      const limit = result.status === 429 ? await readLimit(result) : undefined;
      const signingRejected =
        result.status === 401 || result.status === 403 || limit?.resign === true;
      if (attempt === 0 && signingRejected) {
        this.readerSession = undefined;
        continue;
      }
      throw readerError(result.status, limit, chapterId, response.build !== READER_BUILD);
    }
  }

  // =============================== Settings ===============================

  async getSettingsPage(): Promise<UIForm> {
    const prefs = await loadPreferences();
    let tagOptions: { id: string; title: string }[] = [];
    try {
      const groups = parseTagGroups(await this.getFacets(), ["pornographic"]);
      tagOptions = groups
        .flatMap(({ tags }) => tags)
        .sort((a, b) => a.title.localeCompare(b.title));
    } catch {
      // The tag list is optional; the other settings still work without it.
    }
    return buildSettingsForm(prefs, tagOptions);
  }

  async onFormSubmitted(_id: string, data: any): Promise<void> {
    await savePreferences(data ?? {});
  }

  // =============================== Helpers ===============================

  private async getJson<T>(path: string, params: CatalogueParams = {}): Promise<T> {
    const response = await this.client.get(path, { params: toQueryParams(params) });
    return response.json<T>();
  }

  private async postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.client.post(path, body);
    return response.json<T>();
  }

  private getSeries(contentId: string): Promise<SeriesResponse> {
    return this.getJson(`/cdn/v1/series/${encodeURIComponent(contentId)}`);
  }

  private getFacets(): Promise<FacetsResponse> {
    this.facetsPromise ??= this.getJson<FacetsResponse>("/cdn/v1/facets", { sfw: false }).catch(
      (error: unknown) => {
        this.facetsPromise = undefined;
        throw error;
      }
    );
    return this.facetsPromise;
  }

  private async getTagGroups(ratings: string[]) {
    try {
      return parseTagGroups(await this.getFacets(), ratings);
    } catch (error) {
      if (error instanceof CloudflareError) throw error;
      return [];
    }
  }

  private ensureSiteSession(): Promise<void> {
    this.siteSession ??= this.client
      .get("/api/auth/me", { validateStatus: acceptAnyStatus })
      .then(() => undefined)
      .catch((error: unknown) => {
        this.siteSession = undefined;
        throw error;
      });
    return this.siteSession;
  }

  private getReaderSession(chapterId: string): Promise<ReaderSession> {
    this.readerSession ??= (async () => {
      await this.ensureSiteSession();
      const result = await this.client.get("/api/manga/key", {
        validateStatus: acceptAnyStatus,
      });
      if (!result.ok) {
        const limit = result.status === 429 ? await readLimit(result) : undefined;
        throw readerError(result.status, limit, chapterId);
      }
      const response = parseReaderKeyResponse(await result.json());
      return { readerKey: deriveReaderKey(response), response };
    })().catch((error: unknown) => {
      this.readerSession = undefined;
      throw error;
    });
    return this.readerSession;
  }

  /** Decrypts page images whose page context carries a key and nonce. */
  private async decryptPageResponse(response: HttpResponse): Promise<HttpResponse> {
    const key = response.request.context?.[PAGE_KEY];
    const nonce = response.request.context?.[PAGE_NONCE];
    if (typeof key !== "string" || typeof nonce !== "string") return response;
    if (!response.ok) {
      throw new Error(`Could not load Toonkotsu page (status ${response.status}).`);
    }
    const body = await response.bytes();
    if (!body.length) throw new Error("Toonkotsu returned an empty page image.");
    try {
      const nonceBytes = decodeBase64Url(nonce).subarray(0, 8);
      return response.replaceBody(decryptPage(body, decodeBase64Url(key), nonceBytes));
    } catch (error) {
      const reason = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(`Could not decrypt Toonkotsu page${reason}`);
    }
  }
}

async function readLimit(response: HttpResponse): Promise<ReaderLimit | undefined> {
  try {
    return await response.json<ReaderLimit>();
  } catch {
    return undefined;
  }
}

/**
 * Any reading limit is resolved on the site, which shows the human check in its
 * own reader. Suwatte's reader can't open a web view, so the message points to
 * the settings button that does.
 */
function readerError(
  status: number,
  limit: ReaderLimit | undefined,
  chapterId: string,
  readerChanged = false
): Error {
  if (limit?.code === "manga-limit") {
    return new Error(
      `Toonkotsu wants you to confirm you're human. In Suwatte, open Toonkotsu's settings, tap "${VERIFY_BUTTON_TITLE}", open any chapter on the site and pass the check, then reopen this chapter.`
    );
  }
  const detail = limit?.error ? `: ${limit.error}` : "";
  const reason = readerChanged
    ? " The site's reader has been updated, so this source needs an update too."
    : "";
  return new Error(`Could not load chapter ${chapterId} (status ${status}${detail}).${reason}`);
}
