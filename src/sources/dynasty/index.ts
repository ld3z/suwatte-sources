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
  PagedItemList,
  SearchFilter,
  SearchRequest,
  SelectFilter,
  SortOptions,
  SourceConfiguration,
  SourceInfo,
} from "@suwatte/toolchain";

import { BASE_URL, CLASS_OPTIONS, FEEDS, SORT_OPTIONS } from "./constants";
import { info } from "./info";
import {
  contentPath,
  parseContentId,
  parseCoverFromPage,
  parseDeepLinkId,
  parseEntryList,
  parseHomepage,
  parseReaderPageList,
  parseStandaloneChapter,
  parseTagPageChapters,
  parseTagPageContent,
  toChapterPages,
} from "./parsers";
import { buildSearchPath, searchPathFromRequest } from "./search";
import { withPage } from "./utils";

export default class Dynasty implements Delegate {
  static info: SourceInfo = info;

  client = new HttpClient({
    baseUrl: BASE_URL,
    rateLimit: {
      permits: 2,
      period: 1,
    },
    headers: {
      Referer: `${BASE_URL}/`,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.8",
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

  // ============================== Item List ================================

  async getItemList(
    request: ItemListRequest,
    page: number
  ): Promise<PagedItemList> {
    const feed = FEEDS.find((f) => f.id === request.key) ?? FEEDS[0];
    const html = await this.fetchHtml(
      feed.path
        ? withPage(feed.path, page)
        : buildSearchPath({ sort: feed.sort }, page)
    );
    if (!feed.parseEntries) return parseHomepage(html);
    const list = parseEntryList(html);
    return { ...list, items: await this.withCovers(list.items) };
  }

  // =============================== Search ==================================

  async getSortOptions(): Promise<SortOptions> {
    return {
      options: SORT_OPTIONS,
      // Alphabetical ordering is served by the site; readers should not reverse it.
      disableOrdering: true,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    return [
      SearchFilter("classes", "Content Type", SelectFilter(CLASS_OPTIONS, false)),
    ];
  }

  async getSearchResults(
    request: SearchRequest,
    page: number
  ): Promise<PagedItemList> {
    const deepLinkId = parseDeepLinkId(request.query?.trim() || "");
    if (deepLinkId && page === 1) {
      try {
        const content = await this.getContent(deepLinkId);
        return {
          items: [
            {
              id: deepLinkId,
              title: content.title,
              coverImage: content.coverImage || undefined,
              webUrl: content.webUrl,
              rating: content.rating,
            },
          ],
          isLastPage: true,
        };
      } catch {
        // Fall back to a normal search if the direct lookup fails.
      }
    }

    const list = parseEntryList(
      await this.fetchHtml(searchPathFromRequest(request, page))
    );
    return { ...list, items: await this.withCovers(list.items) };
  }

  // =========================== Content Details =============================

  async getContent(contentId: string): Promise<Content> {
    const { kind, slug } = parseContentId(contentId);
    if (kind === "chapter") {
      return parseStandaloneChapter(
        await this.fetchHtml(`/chapters/${slug}`),
        slug
      ).content;
    }
    return parseTagPageContent(
      await this.fetchHtml(`/${kind}/${slug}`),
      contentId
    );
  }

  // =============================== Chapters ================================

  async getChapters(contentId: string): Promise<Chapter[]> {
    const { kind, slug } = parseContentId(contentId);
    if (kind === "chapter") {
      return [parseStandaloneChapter(await this.fetchHtml(`/chapters/${slug}`), slug).chapter];
    }
    return parseTagPageChapters(await this.fetchHtml(`/${kind}/${slug}`));
  }

  async getChapterPages(
    _contentId: string,
    chapterId: string
  ): Promise<ChapterPage[]> {
    const pages = parseReaderPageList(
      await this.fetchHtml(`/chapters/${chapterId}`)
    );
    if (!pages.length) {
      throw new ChapterUnavailableError(
        `Chapter pages unavailable: ${BASE_URL}/chapters/${chapterId}`
      );
    }
    return toChapterPages(pages);
  }

  // =============================== Helpers =================================

  /**
   * Entry rows carry no images, so each item's cover is read from its own
   * page. Failures leave the item coverless instead of dropping it.
   */
  private async withCovers(items: Item[]): Promise<Item[]> {
    return Promise.all(
      items.map(async (item) => {
        try {
          const cover = parseCoverFromPage(
            await this.fetchHtml(contentPath(item.id)),
            item.id
          );
          return cover ? { ...item, coverImage: cover } : item;
        } catch {
          return item;
        }
      })
    );
  }

  private async fetchHtml(path: string): Promise<string> {
    const response = await this.client.get(path);
    return response.text();
  }
}
