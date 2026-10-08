"use httpclient";

import {
  Chapter,
  ChapterUnavailableError,
  Content,
  Delegate,
  HomePage,
  Item,
  ItemListRequest,
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
} from "@suwatte/toolchain";

import {
  API_URL,
  BASE_URL,
  CONTENT_OPTIONS,
  FEEDS,
  GENRE_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  titleCase,
} from "./constants";
import { info } from "./info";
import {
  dbChaptersToChapters,
  dbItem,
  isProviderNovel,
  novelUrl,
  parseDeepLinkSlug,
  providerItem,
  searchResultItem,
  toChapterHtml,
  toChapters,
  toContent,
  volumesToChapters,
} from "./parsers";
import { buildSearchPath, parseSearchResponse } from "./search";
import {
  DbChapterItem,
  DbChaptersResponse,
  DbFacetsResponse,
  DbNovel,
  DbSearchResponse,
  ProviderChapterResponse,
  ProviderListResponse,
  ProviderNovelResponse,
  ProviderSearchResponse,
  VolumeItem,
  VolumesResponse,
} from "./types";
import { parseCount } from "./utils";

export default class LunarX implements Delegate {
  static info: SourceInfo = info;

  client = new HttpClient({
    baseUrl: API_URL,
    rateLimit: {
      permits: 4,
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

  async getItemList(request: ItemListRequest, page: number): Promise<PagedItemList> {
    const feed = FEEDS.find((f) => f.id === request.key) ?? FEEDS[0];
    const data = await this.getJson<ProviderListResponse>(
      `/api/novels/genres?genre=all&order=${feed.order}&page=${page}`
    );
    const items = (data.data?.novels ?? []).map(providerItem);
    return {
      items,
      total: parseCount(data.data?.total_novels),
      isLastPage: items.length === 0 || page >= (data.data?.total_pages ?? page),
    };
  }

  // =============================== Search ===============================

  async getSortOptions(): Promise<SortOptions> {
    return {
      options: SORT_OPTIONS,
      disableOrdering: true,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    if (this.cachedFilters) return this.cachedFilters;

    let genres = GENRE_OPTIONS;
    try {
      const facets = await this.getJson<DbFacetsResponse>("/api/novels/db/search/facets");
      const live = (facets.tags ?? []).map((t) => ({ id: t.name, title: titleCase(t.name) }));
      if (live.length > 0) genres = live;
    } catch {
      // Keep the static genre list.
    }

    this.cachedFilters = [
      SearchFilter("genres", "Genres", SelectFilter(genres, true)),
      SearchFilter("status", "Status", PickerFilter(STATUS_OPTIONS)),
      SearchFilter("content", "Content Level", SelectFilter(CONTENT_OPTIONS)),
    ];
    return this.cachedFilters;
  }

  async getSearchResults(request: SearchRequest, page: number): Promise<PagedItemList> {
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
              webUrl: novelUrl(deepLinkSlug),
              rating: content.rating,
            },
          ],
          isLastPage: true,
        };
      } catch {
        // Fall back to a normal search if the direct lookup fails.
      }
    }

    const query = request.query?.trim();
    if (query && !request.filters) {
      // Query both Lunar's database (which contains LN volumes like The Devil is a Part-Timer)
      // and the mirrored provider catalog.
      const [providerRes, dbRes] = await Promise.all([
        this.getJson<ProviderSearchResponse>(
          `/api/novels/search?q=${encodeURIComponent(query)}&page=${page}`
        ).catch(() => null),
        this.getJson<DbSearchResponse>(
          `/api/novels/db/search?query=${encodeURIComponent(query)}&page=${page}&limit=30`
        ).catch(() => null),
      ]);

      const seen = new Set<string>();
      const items: Item[] = [];

      for (const novel of dbRes?.novels ?? []) {
        if (!seen.has(novel.slug)) {
          seen.add(novel.slug);
          items.push(dbItem(novel));
        }
      }

      for (const novel of providerRes?.results?.novels ?? []) {
        if (!seen.has(novel.slug)) {
          seen.add(novel.slug);
          items.push(searchResultItem(novel));
        }
      }

      if (items.length > 0) {
        const total = (dbRes?.total ?? 0) + (providerRes?.results?.result_count ?? 0);
        return {
          items,
          total: total > 0 ? total : undefined,
          isLastPage:
            !providerRes?.results?.has_next_page ||
            page >= (providerRes?.results?.total_pages ?? page),
        };
      }
    }

    const data = await this.getJson<DbSearchResponse>(buildSearchPath(request, page));
    return parseSearchResponse(data, page);
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    const [db, provider, volumes] = await Promise.all([
      this.fetchDbNovel(contentId),
      this.fetchProviderNovel(contentId),
      this.fetchVolumes(contentId),
    ]);
    if (!db && !provider && volumes.length === 0) {
      throw new Error(`Novel not found: ${novelUrl(contentId)}`);
    }
    return toContent(contentId, db ?? undefined, provider ?? undefined, volumes.length);
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    // 1. Mirrored serialized chapters (oldest first in API)
    const titles = await this.fetchChapterTitles(contentId);
    if (titles.length > 0) {
      return toChapters(contentId, titles);
    }

    // 2. Volumes and site-uploaded chapters
    const [volumes, dbChapters] = await Promise.all([
      this.fetchVolumes(contentId),
      this.fetchDbChapters(contentId),
    ]);

    // If the novel has volumes, return volumes (e.g. The Devil is a Part-Timer)
    if (volumes.length > 0 && dbChapters.length === 0) {
      return volumesToChapters(contentId, volumes);
    }

    // If the novel has uploaded chapters
    if (dbChapters.length > 0 && volumes.length === 0) {
      return dbChaptersToChapters(contentId, dbChapters);
    }

    // If it has both, prefer individual dbChapters if multiple, otherwise volumes
    if (volumes.length > 0 && volumes.length >= dbChapters.length) {
      return volumesToChapters(contentId, volumes);
    }
    if (dbChapters.length > 0) {
      return dbChaptersToChapters(contentId, dbChapters);
    }

    throw new Error(`No chapters or volumes found for novel: ${novelUrl(contentId)}`);
  }

  // ============================= Chapter Text =============================

  async getChapterText(contentId: string, chapterId: string): Promise<SourceChapterText> {
    const isVolume = chapterId.startsWith("vol-");
    const num = isVolume ? chapterId.replace(/^vol-/, "") : chapterId;

    try {
      const data = await this.getJson<ProviderChapterResponse>(
        `/api/novels?slug=${encodeURIComponent(contentId)}&chapter=${encodeURIComponent(num)}`
      );
      const chapter = data.chapter;
      const body =
        chapter && chapter.chapter_title !== "Error fetching chapter" && chapter.content
          ? toChapterHtml(chapter.content)
          : "";
      if (body) {
        return {
          format: SourceChapterTextFormat.HTML,
          body,
          resources: [],
        };
      }
    } catch {
      // Fall through to unavailable error
    }

    if (isVolume) {
      throw new ChapterUnavailableError(
        `Volume text is only available via the website reader: ${novelUrl(contentId)}/${num}?volume=true`
      );
    }

    throw new ChapterUnavailableError(
      `Chapter text unavailable: ${novelUrl(contentId)}/${chapterId}`
    );
  }

  // =============================== Helpers ===============================

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.client.get(path);
    return response.json<T>();
  }

  private async fetchDbNovel(slug: string): Promise<DbNovel | null> {
    try {
      const data = await this.getJson<{ novel?: DbNovel }>(`/api/novels/title/${encodeURIComponent(slug)}`);
      return data.novel ?? null;
    } catch {
      return null;
    }
  }

  private async fetchProviderNovel(slug: string): Promise<ProviderNovelResponse["novel"] | null> {
    try {
      const data = await this.getJson<ProviderNovelResponse>(`/api/novels?slug=${encodeURIComponent(slug)}`);
      return isProviderNovel(data.novel) ? data.novel : null;
    } catch {
      return null;
    }
  }

  private async fetchChapterTitles(slug: string): Promise<string[]> {
    try {
      const data = await this.getJson<{ titles?: string[] }>(
        `/api/novels/chapter-titles?slug=${encodeURIComponent(slug)}`
      );
      return data.titles ?? [];
    } catch {
      return [];
    }
  }

  private async fetchVolumes(slug: string): Promise<VolumeItem[]> {
    try {
      const data = await this.getJson<VolumesResponse>(
        `/api/novels/${encodeURIComponent(slug)}/volumes`
      );
      return data.volumes ?? [];
    } catch {
      return [];
    }
  }

  private async fetchDbChapters(slug: string): Promise<DbChapterItem[]> {
    try {
      const data = await this.getJson<DbChaptersResponse>(
        `/api/novels/chapters/${encodeURIComponent(slug)}`
      );
      return data.chapters ?? [];
    } catch {
      return [];
    }
  }
}
