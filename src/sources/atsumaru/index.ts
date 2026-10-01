"use httpclient";

import {
  Chapter,
  ChapterPage,
  Content,
  ContentRating,
  ContentStatus,
  ContentType,
  Credit,
  Delegate,
  HomePage,
  Item,
  ItemCollection,
  ItemListRequest,
  PagedItemList,
  ReadingMode,
  SearchFilter,
  SearchRequest,
  SelectFilter,
  SortOptions,
  SourceConfiguration,
  SourceInfo,
  Tag,
  TagSection,
  TextFilter,
  ToggleFilter,
  UIForm,
  UISelect,
  UIToggle,
  WebLink,
} from "@suwatte/toolchain";

import {
  BASE_URL,
  BROWSE_LIMIT,
  CDN_URL,
  FEED_POPULAR_DAILY,
  FEED_POPULAR_MONTHLY,
  FEED_POPULAR_WEEKLY,
  FEED_RECENTLY_UPDATED,
  GENRE_OPTIONS,
  PREF_EXCLUDE_GENRES,
  PREF_SHOW_18,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
} from "./constants";

import {
  AtsumaruAllChaptersResponse,
  AtsumaruAvailableFilters,
  AtsumaruBrowseItem,
  AtsumaruBrowseResponse,
  AtsumaruMangaPage,
  AtsumaruMangaPageResponse,
  AtsumaruReadChapterResponse,
  AtsumaruSearchResponse,
} from "./types";
import { info } from "./info";

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
      feeds: [
        {
          id: FEED_POPULAR_DAILY,
          title: "Popular Today",
          content: {
            list: { key: FEED_POPULAR_DAILY },
          },
        },
        {
          id: FEED_POPULAR_WEEKLY,
          title: "Popular This Week",
          content: {
            list: { key: FEED_POPULAR_WEEKLY },
          },
        },
        {
          id: FEED_POPULAR_MONTHLY,
          title: "Popular This Month",
          content: {
            list: { key: FEED_POPULAR_MONTHLY },
          },
        },
        {
          id: FEED_RECENTLY_UPDATED,
          title: "Recently Updated",
          content: {
            list: { key: FEED_RECENTLY_UPDATED },
          },
        },
      ],
    };
  }

  // ============================== Item List ===============================

  async getItemList(
    request: ItemListRequest,
    page: number
  ): Promise<PagedItemList> {
    const offset = (page - 1) * BROWSE_LIMIT;
    const isAdult = (await ObjectStore.boolean(PREF_SHOW_18)) ?? false;
    const adultParam = isAdult ? "&adult=1" : "";

    const excludedGenres =
      (await ObjectStore.stringArray(PREF_EXCLUDE_GENRES)) ?? [];
    const excludedParam =
      excludedGenres.length > 0
        ? `&excludedTags=${excludedGenres.join(",")}`
        : "";

    const defaultParams = `offset=${offset}&limit=${BROWSE_LIMIT}&types=Manga,Manwha,Manhua,OEL&mediums=Comic${adultParam}${excludedParam}`;

    let path: string;
    switch (request.key) {
      case FEED_POPULAR_WEEKLY:
        path = `/api/home2/popular?${defaultParams}&timeframe=weekly`;
        break;
      case FEED_POPULAR_MONTHLY:
        path = `/api/home2/popular?${defaultParams}&timeframe=monthly`;
        break;
      case FEED_RECENTLY_UPDATED:
        path = `/api/home2/recentlyUpdated?${defaultParams}`;
        break;
      case FEED_POPULAR_DAILY:
      default:
        path = `/api/home2/popular?${defaultParams}&timeframe=daily`;
        break;
    }

    const response = await this.client.get(path);
    const data = await response.json<AtsumaruBrowseResponse>();
    const items = (data.items || []).map((item) => this.toItem(item));

    return {
      items,
      isLastPage: items.length < BROWSE_LIMIT,
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

      if (data.genres && data.genres.length > 0) {
        genreOptions = data.genres.map((g) => ({
          id: String(g.id),
          title: g.name,
        }));
      }

      if (data.types && data.types.length > 0) {
        typeOptions = data.types.map((t) => ({
          id: t.id,
          title: t.name,
        }));
      }

      if (data.statuses && data.statuses.length > 0) {
        statusOptions = data.statuses.map((s) => ({
          id: s.id,
          title: s.name,
        }));
      }
    } catch {
      // Use fallback static options if network call fails
    }

    const filters: SearchFilter[] = [
      SearchFilter("genres", "Genres", SelectFilter(genreOptions, true)),
      SearchFilter("types", "Content Type", SelectFilter(typeOptions, false)),
      SearchFilter(
        "status",
        "Publishing Status",
        SelectFilter(statusOptions, false)
      ),
      SearchFilter("year", "Release Year (e.g. 2024)", TextFilter()),
      SearchFilter("min_chapters", "Minimum Chapters", TextFilter()),
      SearchFilter(
        "official",
        "Only Official Translations",
        ToggleFilter()
      ),
    ];

    this.cachedFilters = filters;
    return filters;
  }

  async getSearchResults(
    request: SearchRequest,
    page: number
  ): Promise<PagedItemList> {
    const rawQuery = request.query?.trim() || "";

    // Deep link support: if query contains /manga/{id} URL or slug
    const urlMatch = rawQuery.match(
      /(?:https?:\/\/atsu\.moe)?\/manga\/([a-zA-Z0-9_-]+)/
    );
    if (urlMatch) {
      const mangaId = urlMatch[1];
      try {
        const content = await this.getContent(mangaId);
        return {
          items: [
            {
              id: mangaId,
              title: content.title,
              coverImage: content.coverImage,
              webUrl: `${BASE_URL}/manga/${mangaId}`,
              rating: content.rating,
            },
          ],
          isLastPage: true,
        };
      } catch {
        // Fall back to normal search if direct lookup fails
      }
    }

    const query = rawQuery.length > 0 ? rawQuery : "*";
    const filterBy: string[] = ["hidden:!=true"];

    const showAdult = (await ObjectStore.boolean(PREF_SHOW_18)) ?? false;

    if (request.filters) {
      const f = request.filters as Record<string, any>;

      // Genres (tri-state / include & exclude)
      if (f.genres) {
        const { include, exclude } = f.genres as {
          include?: string[];
          exclude?: string[];
        };
        if (include && include.length > 0) {
          filterBy.push(include.map((id) => `genreIds:=\`${id}\``).join(" && "));
        }
        if (exclude && exclude.length > 0) {
          filterBy.push(
            `genreIds:!=[${exclude.map((id) => `\`${id}\``).join(",")}]`
          );
        }
      }

      // Types
      if (f.types) {
        const types = (f.types as { include?: string[] }).include;
        if (types && types.length > 0) {
          filterBy.push(`type:=[${types.map((t) => `\`${t}\``).join(",")}]`);
        }
      }

      // Status
      if (f.status) {
        const status = (f.status as { include?: string[] }).include;
        if (status && status.length > 0) {
          filterBy.push(
            `status:=[${status.map((s) => `\`${s}\``).join(",")}]`
          );
        }
      }

      // Release Year
      if (f.year && typeof f.year === "string") {
        const yearInt = parseInt(f.year.trim(), 10);
        if (!isNaN(yearInt)) {
          filterBy.push(`releaseYear:=[${yearInt}]`);
        }
      }

      // Min Chapters
      if (f.min_chapters && typeof f.min_chapters === "string") {
        const minChap = parseInt(f.min_chapters.trim(), 10);
        if (!isNaN(minChap)) {
          filterBy.push(`chapterCount:>=${minChap}`);
        }
      }

      // Official translations
      if (f.official === true) {
        filterBy.push("officialTranslation:=true");
      }
    }

    if (!showAdult) {
      filterBy.push("isAdult:=false");
    }

    filterBy.push(
      "(mbContentRating:=[`Safe`,`Suggestive`,`Erotica`] || mbContentRating:!=*)"
    );
    filterBy.push("medium:!=[`Novel`]");
    filterBy.push("views:>0");

    const queryParams: Record<string, string | number> = {
      q: query,
      filter_by: filterBy.join(" && "),
      page: String(page),
      per_page: String(BROWSE_LIMIT),
    };

    if (request.sort) {
      const direction = request.sort.ascending ? "asc" : "desc";
      queryParams["sort_by"] = `${request.sort.key}:${direction}`;
    }

    if (query !== "*") {
      queryParams["query_by"] = "title,englishTitle,otherNames,authors";
      queryParams["query_by_weights"] = "4,3,2,1";
      queryParams["num_typos"] = "4,3,2,1";
    }

    const queryString = this.buildQueryString(queryParams);
    const response = await this.client.get(
      `/collections/manga/documents/search?${queryString}`
    );
    const data = await response.json<AtsumaruSearchResponse>();

    if (data.hits && Array.isArray(data.hits)) {
      const items = data.hits.map((h) => this.toItem(h.document));
      const perPage = data.request_params?.per_page ?? BROWSE_LIMIT;
      const found = data.found ?? 0;
      const isLastPage = page * perPage >= found || items.length < perPage;
      return {
        items,
        total: found,
        isLastPage,
      };
    } else if (data.items && Array.isArray(data.items)) {
      const items = data.items.map((item) => this.toItem(item));
      return {
        items,
        isLastPage: items.length < BROWSE_LIMIT,
      };
    }

    return { items: [], isLastPage: true };
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    const response = await this.client.get(`/api/manga/page?id=${contentId}`);
    const data = await response.json<AtsumaruMangaPageResponse>();
    const page = data.mangaPage;

    // Cache scanlator map for fast chapter resolution
    if (page.scanlators && Array.isArray(page.scanlators)) {
      const scanlatorMap = new Map(page.scanlators.map((s) => [s.id, s.name]));
      this.scanlatorMapCache.set(contentId, scanlatorMap);
    }

    // Determine content rating
    let rating = ContentRating.EVERYONE;
    if (page.isAdult) {
      rating = ContentRating.MATURE;
    } else if (
      page.genres?.some((g) => ["Adult", "Hentai", "Smut"].includes(g.name))
    ) {
      rating = ContentRating.MATURE;
    } else if (
      page.genres?.some((g) => ["Ecchi"].includes(g.name)) ||
      page.mbContentRating === "Suggestive" ||
      page.mbContentRating === "Erotica"
    ) {
      rating = ContentRating.SUGGESTIVE;
    }

    // Determine publication status
    let status = ContentStatus.UNKNOWN;
    switch (page.status?.toLowerCase()?.trim()) {
      case "ongoing":
        status = ContentStatus.ONGOING;
        break;
      case "completed":
        status = ContentStatus.COMPLETED;
        break;
      case "hiatus":
        status = ContentStatus.HIATUS;
        break;
      case "canceled":
      case "cancelled":
        status = ContentStatus.CANCELLED;
        break;
    }

    // Determine content type
    let contentType = ContentType.MANGA;
    switch (page.type?.toLowerCase()?.trim()) {
      case "manhwa":
      case "manwha":
        contentType = ContentType.MANHWA;
        break;
      case "manhua":
        contentType = ContentType.MANHUA;
        break;
      case "comic":
      case "oel":
        contentType = ContentType.COMIC;
        break;
    }

    const isVertical =
      contentType === ContentType.MANHWA || contentType === ContentType.MANHUA;
    const readingMode = isVertical
      ? ReadingMode.VERTICAL
      : ReadingMode.PAGED_MANGA;

    // Additional Titles
    const additionalTitlesSet = new Set<string>();
    if (page.englishTitle && page.englishTitle !== page.title) {
      additionalTitlesSet.add(page.englishTitle);
    }
    if (Array.isArray(page.otherNames)) {
      for (const name of page.otherNames) {
        if (name && name !== page.title) {
          additionalTitlesSet.add(name);
        }
      }
    }

    // Credits
    const credits: Credit[] = [];
    if (Array.isArray(page.authors)) {
      for (const author of page.authors) {
        if (typeof author === "string") {
          credits.push({ name: author, role: "Author" });
        } else if (author && author.name) {
          credits.push({ name: author.name, role: author.type || "Author" });
        }
      }
    }

    // Genres
    const genres: Tag[] = (page.genres || []).map((g) => ({
      id: String(g.id),
      title: g.name,
    }));

    // Properties (tags)
    const properties: TagSection[] = [];
    if (Array.isArray(page.tags) && page.tags.length > 0) {
      properties.push({
        id: "tags",
        title: "Tags",
        tags: page.tags.map((t) => ({ id: String(t.id), title: t.name })),
      });
    }

    // Recommendations
    const collections: ItemCollection[] = [];
    if (Array.isArray(page.recommendations) && page.recommendations.length > 0) {
      collections.push({
        id: "recommendations",
        title: "Recommendations",
        items: page.recommendations.map((r) => this.toItem(r)),
      });
    }

    // Cross-source tracker endpoints
    const endpoints: Record<string, string> = {};
    if (page.anilistId) endpoints.anilist = String(page.anilistId);
    if (page.malId) endpoints.mal = String(page.malId);
    if (page.kitsuId) endpoints.kitsu = String(page.kitsuId);
    if (page.annId) endpoints.ann = String(page.annId);
    if (page.mangaUpdatesId) endpoints.mangaupdates = String(page.mangaUpdatesId);

    // External web links
    const links: WebLink[] = [
      { title: "Website", url: `${BASE_URL}/manga/${contentId}` },
    ];
    if (page.kenmeiUrl) {
      links.push({ title: "Kenmei", url: page.kenmeiUrl });
    }
    if (page.anilistId) {
      links.push({
        title: "AniList",
        url: `https://anilist.co/manga/${page.anilistId}`,
      });
    }
    if (page.malId) {
      links.push({
        title: "MyAnimeList",
        url: `https://myanimelist.net/manga/${page.malId}`,
      });
    }

    // Statistics
    let statRating: number | undefined;
    if (typeof page.avgRating === "number" && page.avgRating > 0) {
      statRating = Number(page.avgRating.toFixed(2));
    }
    let views: number | undefined;
    if (typeof page.views === "number") {
      views = page.views;
    }

    return {
      title: page.title,
      coverImage: this.extractCover(page),
      bannerImage: page.banner ? this.formatImageUrl(page.banner) : undefined,
      webUrl: `${BASE_URL}/manga/${contentId}`,
      rating,
      status,
      contentType,
      readingMode,
      summary: page.synopsis || undefined,
      additionalTitles: Array.from(additionalTitlesSet),
      credits: credits.length > 0 ? credits : undefined,
      genres: genres.length > 0 ? genres : undefined,
      properties: properties.length > 0 ? properties : undefined,
      collections: collections.length > 0 ? collections : undefined,
      endpoints: Object.keys(endpoints).length > 0 ? endpoints : undefined,
      links,
      statistics: statRating || views ? { rating: statRating, views } : undefined,
    };
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    let scanlatorMap = this.scanlatorMapCache.get(contentId);
    let chaptersData: AtsumaruAllChaptersResponse;

    if (!scanlatorMap) {
      const [pageRes, chaptersRes] = await Promise.all([
        this.client.get(`/api/manga/page?id=${contentId}`),
        this.client.get(`/api/manga/allChapters?mangaId=${contentId}`),
      ]);
      const pageData = await pageRes.json<AtsumaruMangaPageResponse>();
      scanlatorMap = new Map(
        (pageData.mangaPage?.scanlators || []).map((s) => [s.id, s.name])
      );
      this.scanlatorMapCache.set(contentId, scanlatorMap);
      chaptersData = await chaptersRes.json<AtsumaruAllChaptersResponse>();
    } else {
      const chaptersRes = await this.client.get(
        `/api/manga/allChapters?mangaId=${contentId}`
      );
      chaptersData = await chaptersRes.json<AtsumaruAllChaptersResponse>();
    }

    const rawChapters = chaptersData.chapters || [];

    const chapters: Chapter[] = rawChapters.map((ch, idx) => {
      const scanlatorName = ch.scanlationMangaId
        ? scanlatorMap?.get(ch.scanlationMangaId)
        : undefined;

      let date: Date | undefined;
      if (ch.createdAt) {
        const time =
          typeof ch.createdAt === "number"
            ? ch.createdAt
            : Number(ch.createdAt);
        if (!isNaN(time) && time > 0) {
          date = new Date(time);
        }
      }

      return {
        id: ch.id,
        number: typeof ch.number === "number" ? ch.number : -1,
        title: ch.title || undefined,
        index: idx,
        language: "en",
        date,
        webUrl: `${BASE_URL}/read/${contentId}/${ch.id}`,
        providers: scanlatorName
          ? [{ id: ch.scanlationMangaId!, name: scanlatorName, links: [] }]
          : undefined,
      };
    });

    // Sort chapters descending by chapter number, then by upload date
    chapters.sort((a, b) => {
      if (b.number !== a.number) {
        return b.number - a.number;
      }
      const timeA = a.date ? a.date.getTime() : 0;
      const timeB = b.date ? b.date.getTime() : 0;
      return timeB - timeA;
    });

    // Re-index chapters in presentation order
    chapters.forEach((ch, idx) => {
      ch.index = idx;
    });

    return chapters;
  }

  // ============================= Chapter Pages ============================

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
      url: this.formatImageUrl(page.image),
    }));
  }

  // =============================== Settings ===============================

  async getSettingsPage(): Promise<UIForm> {
    const show18 = (await ObjectStore.boolean(PREF_SHOW_18)) ?? false;
    const excludedGenres =
      (await ObjectStore.stringArray(PREF_EXCLUDE_GENRES)) ?? [];

    return {
      sections: [
        {
          header: "Content Preferences",
          views: [
            UIToggle({
              id: PREF_SHOW_18,
              title: "Adult Mode (+18)",
              defaultValue: false,
              currentValue: show18,
            }),
            UISelect({
              id: PREF_EXCLUDE_GENRES,
              title: "Exclude Genres from Browse",
              options: GENRE_OPTIONS,
              exclude: false,
              defaultValue: { include: [], exclude: [] },
              currentValue: { include: excludedGenres, exclude: [] },
            }),
          ],
        },
      ],
    };
  }

  async onFormSubmitted(_id: string, data: any): Promise<void> {
    if (typeof data[PREF_SHOW_18] === "boolean") {
      await ObjectStore.set(PREF_SHOW_18, data[PREF_SHOW_18]);
    }
    if (data[PREF_EXCLUDE_GENRES] && typeof data[PREF_EXCLUDE_GENRES] === "object") {
      const selected =
        (data[PREF_EXCLUDE_GENRES] as { include?: string[] }).include ?? [];
      await ObjectStore.set(PREF_EXCLUDE_GENRES, selected);
    }
  }

  // =============================== Helpers ===============================

  private buildQueryString(
    params: Record<string, string | number | boolean | undefined | null>
  ): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        parts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
        );
      }
    }
    return parts.join("&");
  }

  private formatImageUrl(imagePath?: any): string {
    if (!imagePath) return "";
    let url =
      typeof imagePath === "string"
        ? imagePath
        : imagePath.url || imagePath.image || "";
    if (!url || typeof url !== "string") return "";

    if (url.startsWith("//")) {
      url = `https:${url}`;
    } else if (!url.startsWith("http")) {
      const cleanPath = url.replace(/^\/?(static\/)?/, "");
      url = `${CDN_URL}/static/${cleanPath}`;
    }
    return url.replace(/^https?:\/\/atsu\.moe\//, `${CDN_URL}/`);
  }

  private extractCover(
    item: AtsumaruBrowseItem | AtsumaruMangaPage
  ): string {
    const anyItem = item as any;
    if (typeof anyItem.largeImage === "string")
      return this.formatImageUrl(anyItem.largeImage);
    if (typeof anyItem.mediumImage === "string")
      return this.formatImageUrl(anyItem.mediumImage);
    if (typeof anyItem.smallImage === "string")
      return this.formatImageUrl(anyItem.smallImage);

    if (typeof anyItem.poster === "string") {
      return this.formatImageUrl(anyItem.poster);
    }
    if (anyItem.poster && typeof anyItem.poster === "object") {
      const p = anyItem.poster;
      if (typeof p.largeImage === "string")
        return this.formatImageUrl(p.largeImage);
      if (typeof p.mediumImage === "string")
        return this.formatImageUrl(p.mediumImage);
      if (typeof p.smallImage === "string")
        return this.formatImageUrl(p.smallImage);
      if (typeof p.image === "string")
        return this.formatImageUrl(p.image);
      if (typeof p.url === "string")
        return this.formatImageUrl(p.url);
    }

    if (typeof anyItem.image === "string")
      return this.formatImageUrl(anyItem.image);
    if (anyItem.image && typeof anyItem.image === "object") {
      if (typeof anyItem.image.url === "string")
        return this.formatImageUrl(anyItem.image.url);
    }

    return "";
  }

  private toItem(item: AtsumaruBrowseItem): Item {
    const rating = item.isAdult ? ContentRating.MATURE : ContentRating.EVERYONE;

    let statRating: number | undefined;
    if (typeof item.mbRating === "number" && item.mbRating > 0) {
      statRating = Number(item.mbRating.toFixed(2));
    }

    let views: number | undefined;
    if (typeof item.views === "number") {
      views = item.views;
    }

    return {
      id: item.id,
      title: item.title,
      subtitle:
        item.type ||
        (typeof item.views === "string" ? `${item.views} views` : undefined),
      coverImage: this.extractCover(item),
      webUrl: `${BASE_URL}/manga/${item.id}`,
      rating,
      statistics: statRating || views ? { rating: statRating, views } : undefined,
    };
  }
}
