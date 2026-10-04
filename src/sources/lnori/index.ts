"use httpclient";

import {
  Chapter,
  ChapterUnavailableError,
  Content,
  Delegate,
  HomePage,
  HomePageFeed,
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
  UIForm,
} from "@suwatte/toolchain";

import {
  BASE_URL,
  FEED_SEASONAL,
  LIBRARY_CACHE_MS,
  LIBRARY_FEEDS,
  SORT_OPTIONS,
} from "./constants";
import { info } from "./info";
import {
  allTags,
  LibraryEntry,
  pageOf,
  parseLibrary,
  queryLibrary,
  toItem,
} from "./library";
import { parseSeasonal, parseSeries, parseVolumes, renderBook } from "./parsers";
import { buildSettingsForm, loadShowIllustrations, savePreferences } from "./settings";
import { toTitleCase } from "./utils";

const MIN_VOLUME_OPTIONS: LabeledOption[] = [
  { id: "0", title: "Any" },
  { id: "2", title: "2+" },
  { id: "5", title: "5+" },
  { id: "10", title: "10+" },
  { id: "20", title: "20+" },
];

export default class LNORI implements Delegate {
  static info: SourceInfo = info;

  client = new HttpClient({
    baseUrl: BASE_URL,
    cloudflareResolutionURL: BASE_URL,
    rateLimit: {
      permits: 2,
      period: 1,
    },
    headers: {
      Referer: `${BASE_URL}/`,
    },
  });

  private library: { entries: LibraryEntry[]; fetchedAt: number } | null = null;

  getConfiguration(): SourceConfiguration {
    return {
      imageReferer: `${BASE_URL}/`,
    };
  }

  // =============================== Home Page ===============================

  async getHomePage(): Promise<HomePage> {
    const feeds: HomePageFeed[] = LIBRARY_FEEDS.map((feed) => ({
      id: feed.id,
      title: feed.title,
      content: { list: { key: feed.id } },
    }));

    try {
      const seasonal = parseSeasonal(await this.fetchHtml("/"));
      if (seasonal && seasonal.items.length > 0) {
        feeds.unshift({
          id: FEED_SEASONAL,
          title: seasonal.title,
          content: { list: { key: FEED_SEASONAL } },
        });
      }
    } catch {
      // The seasonal feed is optional; the library feeds still work without it.
    }

    return { feeds };
  }

  // ============================== Item List ===============================

  async getItemList(
    request: ItemListRequest,
    page: number
  ): Promise<PagedItemList> {
    if (request.key === FEED_SEASONAL) {
      const items = parseSeasonal(await this.fetchHtml("/"))?.items ?? [];
      return { items: page === 1 ? items : [], isLastPage: true };
    }

    const feed = LIBRARY_FEEDS.find((f) => f.id === request.key) ?? LIBRARY_FEEDS[0];
    const entries = queryLibrary(await this.getLibrary(), {
      text: "",
      includeTags: [],
      excludeTags: [],
      minVolumes: 0,
      sort: feed.sort,
      ascending: false,
    });
    return pageOf(entries, page);
  }

  // =============================== Search ===============================

  async getSortOptions(): Promise<SortOptions> {
    return {
      options: SORT_OPTIONS,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    const tags = allTags(await this.getLibrary());
    return [
      SearchFilter(
        "genres",
        "Genres",
        SelectFilter(tags.map((t) => ({ id: t, title: toTitleCase(t) })), true)
      ),
      SearchFilter("min_volumes", "Minimum Volumes", PickerFilter(MIN_VOLUME_OPTIONS)),
    ];
  }

  async getSearchResults(
    request: SearchRequest,
    page: number
  ): Promise<PagedItemList> {
    const filters = (request.filters ?? {}) as Record<string, any>;
    const query = request.query?.trim() ?? "";
    const library = await this.getLibrary();

    // A pasted series URL opens that series directly.
    const linkedId = query.match(/\/series\/(\d+\/[^/?#\s]+)/)?.[1];
    const linked = linkedId && library.find((e) => e.id === linkedId);
    if (linked) {
      return { items: [toItem(linked)], isLastPage: true };
    }

    const entries = queryLibrary(library, {
      text: query,
      includeTags: filters.genres?.include ?? [],
      excludeTags: filters.genres?.exclude ?? [],
      minVolumes: Number(filters.min_volumes) || 0,
      sort: request.sort?.key ?? "popular",
      ascending: request.sort?.ascending ?? false,
    });
    return pageOf(entries, page);
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    return parseSeries(await this.fetchHtml(`/series/${contentId}`), contentId);
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    return parseVolumes(await this.fetchHtml(`/series/${contentId}`));
  }

  /** Each chapter is a full volume, served as one page. */
  async getChapterText(
    _contentId: string,
    chapterId: string
  ): Promise<SourceChapterText> {
    const html = await this.fetchHtml(`/book/${chapterId}`);
    const book = renderBook(html, await loadShowIllustrations());
    if (!book) {
      throw new ChapterUnavailableError(`Volume text unavailable: ${chapterId}`);
    }

    return {
      format: SourceChapterTextFormat.HTML,
      body: book.body,
      resources: book.resources,
    };
  }

  // =============================== Settings ===============================

  async getSettingsPage(): Promise<UIForm> {
    return buildSettingsForm();
  }

  async onFormSubmitted(_id: string, data: any): Promise<void> {
    await savePreferences(data);
  }

  // =============================== Helpers ===============================

  /** The site lists its whole catalog on one page, so it is fetched once and searched locally. */
  private async getLibrary(): Promise<LibraryEntry[]> {
    if (this.library && Date.now() - this.library.fetchedAt < LIBRARY_CACHE_MS) {
      return this.library.entries;
    }
    const entries = parseLibrary(await this.fetchHtml("/library"));
    this.library = { entries, fetchedAt: Date.now() };
    return entries;
  }

  private async fetchHtml(path: string): Promise<string> {
    const response = await this.client.get(path);
    return response.text();
  }
}
