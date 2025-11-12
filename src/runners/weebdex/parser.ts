import {
  Chapter,
  ChapterData,
  Content,
  Highlight,
  Property,
  PublicationStatus,
  Tag as SuwatteTag,
} from "@suwatte/daisuke";
import {
  buildChapterId,
  buildMangaId,
  cleanDescription,
  fetchJSON,
  formatChapterNumber,
  formatDemographic,
  formatStatus,
  getAltTitles,
  getCoverUrl,
  getPageUrl,
  getPrimaryTitle,
  parseMangaId,
  proxifyImage,
  SimpleNetworkClient,
} from "./helpers";
import {
  Chapter as WeebDexChapter,
  ChapterListResponse,
  Manga,
  MangaListResponse,
  AggregatedChapterResponse,
} from "./types";

/**
 * Search manga by title
 */
export async function searchManga(
  query: string,
  client: SimpleNetworkClient,
  page: number = 1,
  limit: number = 20
): Promise<MangaListResponse> {
  const params: Record<string, any> = {
    title: query,
    limit,
    page,
    order: "desc",
    sort: "relevance",
    contentRating: ["safe", "suggestive", "erotica"],
  };

  return fetchJSON<MangaListResponse>("/manga", client, params);
}

/**
 * Get manga by ID
 */
export async function getMangaById(
  id: string,
  client: SimpleNetworkClient
): Promise<Manga> {
  return fetchJSON<Manga>(`/manga/${id}`, client);
}

/**
 * Get chapters for a manga
 */
export async function getChaptersForManga(
  mangaId: string,
  client: SimpleNetworkClient,
  page: number = 1,
  limit: number = 100,
  translatedLanguage?: string[]
): Promise<ChapterListResponse> {
  try {
    const params: Record<string, any> = {
      limit,
      page,
      order: "desc",
      sort: "published_at",
    };

    if (translatedLanguage && translatedLanguage.length > 0) {
      params.tlang = translatedLanguage;
    }

    console.log(`getChaptersForManga: Requesting /manga/${mangaId}/chapters with params:`, JSON.stringify(params));
    const response = await fetchJSON<ChapterListResponse>(
      `/manga/${mangaId}/chapters`,
      client,
      params
    );
    console.log(`getChaptersForManga: Success, got ${response.data?.length || 0} chapters`);
    return response;
  } catch (error) {
    console.error(`getChaptersForManga: Failed for manga ${mangaId}:`, error);
    
    // Try with minimal parameters as fallback
    console.log(`getChaptersForManga: Trying fallback with minimal params...`);
    try {
      const minimalResponse = await fetchJSON<ChapterListResponse>(
        `/manga/${mangaId}/chapters`,
        client,
        { limit, page }
      );
      console.log(`getChaptersForManga: Fallback success, got ${minimalResponse.data?.length || 0} chapters`);
      return minimalResponse;
    } catch (fallbackError) {
      console.error(`getChaptersForManga: Fallback also failed:`, fallbackError);
      throw fallbackError;
    }
  }
}

/**
 * Get all chapters for a manga (handles pagination)
 */
export async function getAllChapters(
  mangaId: string,
  client: SimpleNetworkClient,
  translatedLanguage?: string[]
): Promise<WeebDexChapter[]> {
  try {
    console.log(`getAllChapters: Fetching chapters for manga ${mangaId}`);
    const allChapters: WeebDexChapter[] = [];
    let page = 1;
    const limit = 100;

    while (true) {
      console.log(`getAllChapters: Fetching page ${page}`);
      const response = await getChaptersForManga(
        mangaId,
        client,
        page,
        limit,
        translatedLanguage
      );

      console.log(`getAllChapters: Page ${page} returned ${response.data.length} chapters, total: ${response.total}`);
      allChapters.push(...response.data);

      // Check if we've received all chapters
      if (response.data.length < limit || page * limit >= response.total) {
        break;
      }

      page++;
    }

    console.log(`getAllChapters: Total chapters collected: ${allChapters.length}`);
    return allChapters;
  } catch (error) {
    console.error(`getAllChapters: Error fetching chapters for ${mangaId}:`, error);
    throw error;
  }
}

/**
 * Get chapter by ID
 */
export async function getChapterById(
  chapterId: string,
  client: SimpleNetworkClient
): Promise<WeebDexChapter> {
  return fetchJSON<WeebDexChapter>(`/chapter/${chapterId}`, client);
}

/**
 * Get aggregated chapter list (useful for organization)
 */
export async function getAggregatedChapters(
  mangaId: string,
  client: SimpleNetworkClient,
  translatedLanguage?: string[]
): Promise<AggregatedChapterResponse> {
  const params: Record<string, any> = {};

  if (translatedLanguage && translatedLanguage.length > 0) {
    params.tlang = translatedLanguage;
  }

  return fetchJSON<AggregatedChapterResponse>(
    `/manga/${mangaId}/aggregate`,
    client,
    params
  );
}

/**
 * Get latest manga feed
 */
export async function getLatestFeed(
  client: SimpleNetworkClient,
  page: number = 1,
  limit: number = 20
): Promise<ChapterListResponse> {
  const params: Record<string, any> = {
    limit,
    page,
    contentRating: ["safe", "suggestive", "erotica"],
  };

  return fetchJSON<ChapterListResponse>("/chapter/feed", client, params);
}

/**
 * Get top manga by views
 */
export async function getTopManga(
  client: SimpleNetworkClient,
  rank: "views" | "follows" | "rating" = "views",
  time: "1d" | "7d" | "30d" | "all" = "7d",
  page: number = 1,
  limit: number = 20
): Promise<MangaListResponse> {
  const params: Record<string, any> = {
    rank,
    time,
    limit,
    page,
    contentRating: ["safe", "suggestive", "erotica"],
  };

  return fetchJSON<MangaListResponse>("/top/manga", client, params);
}

/**
 * Convert WeebDex manga to Suwatte Content
 */
export function mangaToContent(manga: Manga): Content {
  const contentId = buildMangaId(manga.id);
  const primaryTitle = getPrimaryTitle(manga);
  const altTitles = getAltTitles(manga);

  // Build cover URL
  let cover = "/assets/weebdex_logo.png";
  if (manga.relationships?.cover) {
    const coverId = manga.relationships.cover.id;
    const ext = manga.relationships.cover.ext || "jpg";
    cover = proxifyImage(getCoverUrl(manga.id, coverId, ext, "512"));
  }

  // Build properties - using tags array format like atsumaru
  const properties: Property[] = [];

  // Create tags for metadata display
  const metadataTags: any[] = [];
  
  // Add status
  if (manga.status) {
    metadataTags.push({
      id: "status",
      title: formatStatus(manga.status),
    });
  }

  // Add demographic
  const demographic = formatDemographic(manga.demographic);
  if (demographic) {
    metadataTags.push({
      id: "demographic",
      title: demographic,
    });
  }

  // Add year
  if (manga.year) {
    metadataTags.push({
      id: "year",
      title: String(manga.year),
    });
  }

  // Add content rating
  if (manga.content_rating) {
    metadataTags.push({
      id: "content_rating",
      title: manga.content_rating.charAt(0).toUpperCase() + manga.content_rating.slice(1),
    });
  }

  if (metadataTags.length > 0) {
    properties.push({
      id: "metadata",
      title: "Info",
      tags: metadataTags,
    } as any);
  }

  // Add genre tags
  if (manga.relationships?.tags && manga.relationships.tags.length > 0) {
    properties.push({
      id: "genres",
      title: "Genres",
      tags: manga.relationships.tags.map((tag) => ({
        id: tag.id,
        title: tag.name,
      })),
    } as any);
  }

  // Determine publication status
  let publicationStatus = PublicationStatus.ONGOING;
  if (manga.status === "completed") {
    publicationStatus = PublicationStatus.COMPLETED;
  } else if (manga.status === "ongoing") {
    publicationStatus = PublicationStatus.ONGOING;
  } else if (manga.status === "hiatus") {
    publicationStatus = PublicationStatus.HIATUS;
  } else if (manga.status === "cancelled") {
    publicationStatus = PublicationStatus.CANCELLED;
  }

  // Build additional info
  const additionalTitles: string[] = [];
  if (altTitles) {
    additionalTitles.push(altTitles);
  }

  return {
    title: primaryTitle,
    cover,
    summary: cleanDescription(manga.description),
    status: publicationStatus,
    properties,
    additionalTitles,
    webUrl: `https://weebdex.org/manga/${manga.id}`,
    creators: manga.relationships?.authors?.map((a) => a.name) || [],
  };
}

/**
 * Convert WeebDex chapter to Suwatte Chapter
 */
export function chapterToSuwatteChapter(
  chapter: WeebDexChapter,
  mangaId: string
): Chapter {
  const chapterId = buildChapterId(mangaId, chapter.id, chapter.language);
  
  // Build chapter title
  let title = chapter.title || "";
  if (!title) {
    title = formatChapterNumber(chapter.chapter, chapter.volume);
  }

  // Get group names
  const groups = chapter.relationships?.groups?.map((g) => g.name) || [];

  // Parse chapter number
  let chapterNum = 0;
  if (chapter.chapter) {
    const parsed = parseFloat(chapter.chapter);
    if (!isNaN(parsed)) {
      chapterNum = parsed;
    }
  }

  // Parse volume number
  let volumeNum: number | undefined;
  if (chapter.volume) {
    const parsed = parseFloat(chapter.volume);
    if (!isNaN(parsed)) {
      volumeNum = parsed;
    }
  }

  return {
    chapterId,
    number: chapterNum,
    volume: volumeNum,
    title,
    language: chapter.language,
    date: new Date(chapter.published_at),
    index: 0,
  };
}

/**
 * Convert WeebDex chapter to ChapterData (pages)
 */
export async function getChapterData(
  chapterId: string,
  client: SimpleNetworkClient,
  useOptimized: boolean = false
): Promise<ChapterData> {
  const chapter = await getChapterById(chapterId, client);

  // Select data source
  const pages = useOptimized && chapter.data_optimized.length > 0
    ? chapter.data_optimized
    : chapter.data;

  if (!pages || pages.length === 0) {
    throw new Error(`No pages found for chapter ${chapterId}`);
  }

  // Build page URLs
  const pageUrls = pages.map((page) => ({
    url: getPageUrl(chapter.node, chapterId, page.name, useOptimized),
    width: page.dimensions[0],
    height: page.dimensions[1],
  }));

  return {
    pages: pageUrls,
  };
}

/**
 * Convert manga list to highlights for search results
 */
export function mangaListToHighlights(mangaList: Manga[]): Highlight[] {
  return mangaList.map((manga) => {
    let cover = "/assets/weebdex_logo.png";
    if (manga.relationships?.cover) {
      const coverId = manga.relationships.cover.id;
      const ext = manga.relationships.cover.ext || "jpg";
      cover = proxifyImage(getCoverUrl(manga.id, coverId, ext, "256"));
    }

    const title = getPrimaryTitle(manga);
    let subtitle = "";

    // Add status to subtitle
    if (manga.status) {
      subtitle = formatStatus(manga.status);
    }

    // Add demographic
    const demographic = formatDemographic(manga.demographic);
    if (demographic) {
      subtitle = subtitle ? `${subtitle} • ${demographic}` : demographic;
    }

    // Add year
    if (manga.year) {
      subtitle = subtitle ? `${subtitle} • ${manga.year}` : String(manga.year);
    }

    return {
      id: buildMangaId(manga.id),
      title,
      cover,
      subtitle: subtitle || undefined,
    };
  });
}

/**
 * Convert chapter list to highlights
 */
export function chapterListToHighlights(chapters: WeebDexChapter[]): Highlight[] {
  return chapters.map((chapter) => {
    const manga = chapter.relationships?.manga;
    
    // Fallback if manga data is missing
    if (!manga || !manga.id) {
      const chapterTitle = formatChapterNumber(chapter.chapter, chapter.volume);
      return {
        id: buildMangaId(chapter.id),
        title: chapter.title || chapterTitle || "Unknown Chapter",
        cover: "/assets/weebdex_logo.png",
        subtitle: `Chapter ${chapter.id.slice(0, 8)}...`,
      };
    }

    let cover = "/assets/weebdex_logo.png";
    if (manga.relationships?.cover) {
      const coverId = manga.relationships.cover.id;
      const ext = manga.relationships.cover.ext || "jpg";
      cover = proxifyImage(getCoverUrl(manga.id, coverId, ext, "256"));
    }

    // Get manga title safely
    const title = manga.title || "Unknown Manga";
    const chapterTitle = formatChapterNumber(chapter.chapter, chapter.volume);
    const subtitle = chapter.title ? `${chapterTitle} - ${chapter.title}` : chapterTitle;

    return {
      id: buildMangaId(manga.id),
      title,
      cover,
      subtitle,
    };
  });
}