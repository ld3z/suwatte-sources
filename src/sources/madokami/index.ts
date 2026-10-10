"use httpclient";

import {
  Chapter,
  ChapterPage,
  ChapterUnavailableError,
  Content,
  Delegate,
  HomePage,
  Item,
  ItemListRequest,
  NetworkRequest,
  PagedItemList,
  SearchRequest,
  SourceConfiguration,
  SourceInfo,
  UIForm,
} from "@suwatte/toolchain";

import { BASE_URL, FEED_RECENT, LOGGED_OUT_MESSAGE, PAGE_SIZE } from "./constants";
import { info } from "./info";
import {
  parseChapters,
  parseContent,
  parseCover,
  parseItems,
  parsePages,
  RECENT_SELECTOR,
  SEARCH_SELECTOR,
} from "./parsers";
import {
  buildSettingsForm,
  clearCredentials,
  loadCredentials,
  readCredentials,
  saveCredentials,
} from "./settings";
import { basicAuthHeader, detailsPath } from "./utils";

/** Request context flag: the request carries its own credentials and handles 401 itself. */
const VERIFY_LOGIN = "verifyLogin";

export default class Madokami implements Delegate {
  static info: SourceInfo = info;

  client = new HttpClient({
    baseUrl: BASE_URL,
    headers: {
      Referer: `${BASE_URL}/`,
    },
    // 401 reaches the response interceptor so it can explain how to sign in.
    validateStatus: (status) => (status >= 200 && status < 400) || status === 401,
  });

  /** `undefined` until loaded from the secure store; `null` when signed out. */
  private authHeader: string | null | undefined;

  constructor() {
    this.client.interceptors.request.use(async (request) => {
      if (request.context?.[VERIFY_LOGIN]) return request;
      const authHeader = await this.getAuthHeader();
      if (authHeader) {
        request.headers.set("Authorization", authHeader);
      }
      return request;
    });

    this.client.interceptors.response.use((response) => {
      if (response.status === 401 && !response.request.context?.[VERIFY_LOGIN]) {
        throw new Error(LOGGED_OUT_MESSAGE);
      }
      return response;
    });
  }

  getConfiguration(): SourceConfiguration {
    return {
      imageReferer: `${BASE_URL}/`,
    };
  }

  // =============================== Home Page ===============================

  async getHomePage(): Promise<HomePage> {
    return {
      feeds: [
        {
          id: FEED_RECENT,
          title: "Recent Manga",
          content: { list: { key: FEED_RECENT } },
        },
      ],
    };
  }

  // ============================== Item List ===============================

  async getItemList(_request: ItemListRequest, page: number): Promise<PagedItemList> {
    const items = parseItems(await this.fetchHtml("/recent"), RECENT_SELECTOR);
    return this.pageWithCovers(items, page);
  }

  // =============================== Search ===============================

  async getSearchResults(request: SearchRequest, page: number): Promise<PagedItemList> {
    const query = request.query?.trim();
    if (!query) {
      return this.getItemList({ key: FEED_RECENT }, page);
    }

    const response = await this.client.get("/search", { params: { q: query } });
    const items = parseItems(await response.text(), SEARCH_SELECTOR);
    return this.pageWithCovers(items, page);
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    return parseContent(await this.fetchHtml(detailsPath(contentId)), contentId);
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    return parseChapters(await this.fetchHtml(contentId));
  }

  async getChapterPages(_contentId: string, chapterId: string): Promise<ChapterPage[]> {
    if (!chapterId.startsWith("/")) {
      throw new ChapterUnavailableError("Refresh the chapter list");
    }
    return parsePages(await this.fetchHtml(chapterId));
  }

  async willRequestImage(request: NetworkRequest): Promise<NetworkRequest> {
    const authHeader = await this.getAuthHeader();
    return {
      ...request,
      headers: {
        ...request.headers,
        Referer: `${BASE_URL}/`,
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    };
  }

  // ============================ Authentication ============================

  async getSettingsPage(): Promise<UIForm> {
    return buildSettingsForm(await loadCredentials());
  }

  async onFormSubmitted(_id: string, data: any): Promise<void> {
    const credentials = readCredentials(data ?? {});
    if (!credentials) {
      await this.clearAuthentication();
      return;
    }

    const authHeader = basicAuthHeader(credentials.username, credentials.password);
    const response = await this.client.get("/", {
      headers: { Authorization: authHeader },
      context: { [VERIFY_LOGIN]: true },
    });
    if (response.status === 401) {
      throw new Error("Invalid Madokami username or password.");
    }

    await saveCredentials(credentials);
    this.authHeader = authHeader;
  }

  async clearAuthentication(): Promise<void> {
    await clearCredentials();
    this.authHeader = null;
  }

  // =============================== Helpers ===============================

  private async getAuthHeader(): Promise<string | null> {
    if (this.authHeader === undefined) {
      const credentials = await loadCredentials();
      this.authHeader = credentials
        ? basicAuthHeader(credentials.username, credentials.password)
        : null;
    }
    return this.authHeader;
  }

  private async fetchHtml(path: string): Promise<string> {
    const response = await this.client.get(path);
    return response.text();
  }

  /**
   * The site returns whole lists without pagination, so they are paged
   * locally. Covers are only on series pages and are fetched per page.
   */
  private async pageWithCovers(items: Item[], page: number): Promise<PagedItemList> {
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = items.slice(start, start + PAGE_SIZE);

    const withCovers = await Promise.all(
      pageItems.map(async (item) => ({
        ...item,
        coverImage: await this.fetchCover(item.id),
      }))
    );

    return {
      items: withCovers,
      total: items.length,
      isLastPage: start + PAGE_SIZE >= items.length,
    };
  }

  private async fetchCover(contentId: string): Promise<string | undefined> {
    try {
      const response = await this.client.get(detailsPath(contentId), {
        retries: { count: 2, delay: 1000 },
      });
      return parseCover(await response.text());
    } catch {
      return undefined;
    }
  }
}
