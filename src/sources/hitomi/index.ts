"use httpclient";

import {
  Chapter,
  ChapterPage,
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
  UIForm,
} from "@suwatte/toolchain";

import {
  ALL_LANGUAGES,
  BASE_URL,
  FEEDS,
  GG_TTL_MS,
  LANGUAGE_OPTIONS,
  LTN_URL,
  PAGE_SIZE,
  QUERY_LIST_PREFIX,
  SORT_OPTIONS,
  SortDefinition,
  TYPE_OPTIONS,
} from "./constants";
import { imageUrl, parseImageServerRules } from "./images";
import { info, variants } from "./info";
import { HitomiIndex } from "./nozomi";
import { galleryKeys, parseGalleryScript, toChapter, toContent, toItem } from "./parsers";
import {
  ParsedQuery,
  ResolvedQuery,
  parseDeepLinkId,
  parseQueryString,
  parseSearchRequest,
  resolveQuery,
  sortById,
} from "./search";
import { Preferences, buildSettingsForm, loadPreferences, savePreferences } from "./settings";
import { HitomiGallery, ImageServerRules } from "./types";

const GALLERY_CACHE_SIZE = 200;
const SEARCH_CACHE_SIZE = 4;
const RELATED_LIMIT = 6;

export default class Hitomi implements Delegate {
  static info: SourceInfo = info;
  static variants: SourceVariant[] = variants;

  client = new HttpClient({
    timeout: 30_000,
    retries: 2,
    headers: {
      Referer: `${BASE_URL}/`,
      Origin: BASE_URL,
    },
  });

  /** Hitomi language name this variant lists, or "all". */
  private readonly language: string;
  private index = new HitomiIndex(this.client);
  private galleries = new Map<string, HitomiGallery>();
  private searches = new Map<string, number[]>();
  private imageRules?: { rules: ImageServerRules; fetchedAt: number };

  constructor(args?: Record<string, unknown>) {
    const language = args?.language;
    this.language = typeof language === "string" && language ? language : ALL_LANGUAGES;
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

  async getItemList(request: ItemListRequest, page: number): Promise<PagedItemList> {
    const key = request.key ?? "";
    if (key.startsWith(QUERY_LIST_PREFIX)) {
      const query = parseQueryString(key.slice(QUERY_LIST_PREFIX.length));
      return this.search(query, sortById(request.sort?.key), page);
    }
    return this.search(parseQueryString(""), sortById(key), page);
  }

  // =============================== Search ===============================

  async getSortOptions(): Promise<SortOptions> {
    return {
      options: SORT_OPTIONS,
      disableOrdering: true,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    const filters = [
      SearchFilter("type", "Type", SelectFilter(TYPE_OPTIONS, true)),
      SearchFilter(
        "tags",
        "Tags",
        TextFilter(),
        "Comma-separated; e.g. female:big breasts, -male:yaoi, netorare"
      ),
      SearchFilter("artists", "Artists", TextFilter(), "Comma-separated; several match any"),
      SearchFilter("groups", "Groups", TextFilter(), "Comma-separated; several match any"),
      SearchFilter("series", "Series", TextFilter(), "Comma-separated; e.g. touhou project"),
      SearchFilter("characters", "Characters", TextFilter(), "Comma-separated"),
    ];
    if (this.language === ALL_LANGUAGES) {
      filters.push(SearchFilter("language", "Language", PickerFilter(LANGUAGE_OPTIONS)));
    }
    return filters;
  }

  async getSearchResults(request: SearchRequest, page: number): Promise<PagedItemList> {
    const deepLinkId = parseDeepLinkId(request.query ?? "");
    if (deepLinkId && page === 1) {
      try {
        const gallery = await this.fetchGallery(deepLinkId);
        return { items: [toItem(gallery, this.language)], isLastPage: true };
      } catch {
        // Fall back to a normal search if the gallery can't be loaded.
      }
    }
    return this.search(parseSearchRequest(request), sortById(request.sort?.key), page);
  }

  // =========================== Content Details ============================

  async getContent(contentId: string): Promise<Content> {
    const gallery = await this.fetchGallery(contentId);
    const relatedIds = (gallery.related ?? []).slice(0, RELATED_LIMIT);
    const related = (await this.fetchGalleries(relatedIds.map(String))).map((g) =>
      toItem(g, this.language)
    );
    return toContent(gallery, contentId, related);
  }

  // =============================== Chapters ===============================

  async getChapters(contentId: string): Promise<Chapter[]> {
    return [toChapter(await this.fetchGallery(contentId), contentId)];
  }

  async getChapterPages(contentId: string, _chapterId: string): Promise<ChapterPage[]> {
    const [gallery, rules, prefs] = await Promise.all([
      this.fetchGallery(contentId),
      this.imageServerRules(),
      loadPreferences(),
    ]);
    return gallery.files.map((file) => ({
      url: imageUrl(file, rules, prefs.imageFormat),
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

  private async search(
    parsed: ParsedQuery,
    sort: SortDefinition,
    page: number
  ): Promise<PagedItemList> {
    const state = {
      language: parsed.language ?? this.language,
      orderby: sort.orderby,
      orderbykey: sort.orderbykey,
    };
    const cacheKey = JSON.stringify([parsed, state]);
    const cached = this.searches.get(cacheKey);
    const resolved: ResolvedQuery = cached
      ? { kind: "ids", ids: cached }
      : await resolveQuery(this.index, parsed, state);
    if (resolved.kind === "ids" && !cached) {
      this.searches.set(cacheKey, resolved.ids);
      trim(this.searches, SEARCH_CACHE_SIZE);
    }

    let ids: number[];
    let total: number;
    if (resolved.kind === "paged") {
      ({ ids, total } = await this.index.page(resolved.path, page));
    } else {
      total = resolved.ids.length;
      ids = resolved.ids.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    }

    const prefs = await loadPreferences();
    const wantsAnime = [...parsed.positive, ...parsed.anyOf.flat()].some(
      (t) => t.ns === "type" && t.value === "anime"
    );
    const galleries = await this.fetchGalleries(ids.map(String));
    return {
      items: galleries
        .filter((g) => isVisible(g, prefs, wantsAnime))
        .map((g) => toItem(g, this.language)),
      total,
      isLastPage: page * PAGE_SIZE >= total,
    };
  }

  private async fetchGallery(id: string): Promise<HitomiGallery> {
    const cached = this.galleries.get(id);
    if (cached) return cached;
    const response = await this.client.get(`${LTN_URL}/galleries/${id}.js`, {
      validateStatus: (status) => status < 500,
    });
    if (response.status === 404) {
      throw new Error(`Gallery ${id} is no longer available on Hitomi.`);
    }
    if (!response.ok) {
      throw new Error(`Hitomi gallery request failed (${response.status}).`);
    }
    const gallery = parseGalleryScript(await response.text());
    this.galleries.set(id, gallery);
    trim(this.galleries, GALLERY_CACHE_SIZE);
    return gallery;
  }

  /** Galleries in the given order; ones that fail to load are skipped. */
  private async fetchGalleries(ids: string[]): Promise<HitomiGallery[]> {
    const results = await Promise.all(
      ids.map((id) => this.fetchGallery(id).catch(() => null))
    );
    return results.filter((g): g is HitomiGallery => g !== null);
  }

  private async imageServerRules(): Promise<ImageServerRules> {
    const cached = this.imageRules;
    if (cached && Date.now() - cached.fetchedAt < GG_TTL_MS) return cached.rules;
    const response = await this.client.get(`${LTN_URL}/gg.js`, {
      params: { _: Date.now() },
    });
    const rules = parseImageServerRules(await response.text());
    this.imageRules = { rules, fetchedAt: Date.now() };
    return rules;
  }
}

function isVisible(gallery: HitomiGallery, prefs: Preferences, wantsAnime: boolean): boolean {
  if (prefs.hideAnime && !wantsAnime && gallery.type === "anime") return false;
  if (!prefs.hiddenTags.length) return true;
  const keys = galleryKeys(gallery);
  return !prefs.hiddenTags.some((tag) => keys.has(tag));
}

function trim<K, V>(map: Map<K, V>, size: number) {
  while (map.size > size) map.delete(map.keys().next().value as K);
}
