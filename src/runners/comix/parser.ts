import {
  Chapter,
  ChapterData,
  Content,
  Highlight,
  Property,
  PublicationStatus,
} from "@suwatte/daisuke";
import { API_URL, BASE_URL, OFFICIAL_GROUP_ID } from "./constants";
import {
  buildChapterId,
  buildMangaId,
  formatChapterNumber,
  generateStarRating,
  getPosterUrl,
  SimpleNetworkClient,
} from "./helpers";
import {
  Chapter as ComixChapter,
  ChapterDataResponse,
  ChapterListResponse,
  Manga,
  SearchResponse,
  SingleMangaResponse,
  Term,
} from "./types";

// Polyfill for environments without URLSearchParams (e.g., embedded JS runtimes)
// Provides append(key, value) and toString() methods.
function makeParams() {
  const entries: string[] = [];
  return {
    append(key: string, value: string) {
      entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    },
    toString() {
      return entries.join("&");
    },
  };
}
// Convert Comix manga to Suwatte Content
export function mangaToContent(
  manga: Manga,
  posterQuality: string = "large",
  showAltTitles: boolean = false,
  scorePosition: string = "top"
): Content {
  const rating = generateStarRating(manga.rated_avg || 0);
  
  // Build description
  let description = "";
  
  if (scorePosition === "top" && rating) {
    description += rating + "\n\n";
  }
  
  if (manga.synopsis) {
    description += manga.synopsis;
  }
  
  if (showAltTitles && manga.alt_titles && manga.alt_titles.length > 0) {
    description += "\n\nAlternative Names:\n" + manga.alt_titles.join("\n");
  }
  
  if (scorePosition === "bottom" && rating) {
    if (description) description += "\n\n";
    description += rating;
  }

  // Map status
  let status = PublicationStatus.ONGOING;
  switch (manga.status) {
    case "releasing":
      status = PublicationStatus.ONGOING;
      break;
    case "on_hiatus":
      status = PublicationStatus.HIATUS;
      break;
    case "finished":
      status = PublicationStatus.COMPLETED;
      break;
    case "discontinued":
      status = PublicationStatus.CANCELLED;
      break;
  }

  // Build properties
  const properties: Property[] = [];

  if (manga.author && manga.author.length > 0) {
    properties.push({
      id: "author",
      title: "Author",
      tags: manga.author.map((a) => ({ id: a.term_id.toString(), title: a.title })),
    });
  }

  if (manga.artist && manga.artist.length > 0) {
    properties.push({
      id: "artist",
      title: "Artist",
      tags: manga.artist.map((a) => ({ id: a.term_id.toString(), title: a.title })),
    });
  }

  // Build genre tags
  const genreTags: string[] = [];
  
  // Add type
  if (manga.type) {
    const typeMap: { [key: string]: string } = {
      manga: "Manga",
      manhwa: "Manhwa",
      manhua: "Manhua",
      other: "Other",
    };
    genreTags.push(typeMap[manga.type] || manga.type);
  }

  // Add genres
  if (manga.genre && manga.genre.length > 0) {
    genreTags.push(...manga.genre.map((g) => g.title));
  }

  // Add themes
  if (manga.theme && manga.theme.length > 0) {
    genreTags.push(...manga.theme.map((t) => t.title));
  }

  // Add demographics
  if (manga.demographic && manga.demographic.length > 0) {
    genreTags.push(...manga.demographic.map((d) => d.title));
  }

  // Add NSFW tag
  if (manga.is_nsfw) {
    genreTags.push("NSFW");
  }

  // Add genres property for tags display
  if (genreTags.length > 0) {
    properties.push({
      id: "genres",
      title: "Genres",
      tags: genreTags.map((tag, index) => ({ id: `genre_${index}`, title: tag })),
    });
  }

  return {
    title: manga.title,
    cover: getPosterUrl(manga.poster, posterQuality),
    summary: description,
    status,
    creators: manga.author?.map((a) => a.title) || [],
    properties,
    webUrl: `${BASE_URL}/title/${manga.hash_id}`,
    recommendedPanelMode: manga.type === "manhwa" ? 1 : 0, // 1 for webtoon/vertical, 0 for page-by-page
    isNSFW: manga.is_nsfw,
    additionalTitles: manga.alt_titles || [],
  };
}

// Convert manga list to highlights
export function mangaListToHighlights(
  mangas: Manga[],
  posterQuality: string = "large"
): Highlight[] {
  return mangas.map((manga) => ({
    id: buildMangaId(manga.hash_id),
    title: manga.title,
    cover: getPosterUrl(manga.poster, posterQuality),
  }));
}

// Get manga by ID
export async function getMangaById(
  hashId: string,
  client: SimpleNetworkClient
): Promise<Content> {
  const url = `${API_URL}/manga/${hashId}?includes[]=demographic&includes[]=genre&includes[]=theme&includes[]=author&includes[]=artist&includes[]=publisher`;

  const response = await client.get(url);
  const data: SingleMangaResponse = typeof response === "string"
    ? JSON.parse(response)
    : response;

  return mangaToContent(data.result);
}

// Search manga
export async function searchManga(
  query: string,
  client: SimpleNetworkClient,
  page: number = 1,
  filters?: any
): Promise<SearchResponse> {
  const params = makeParams();

  // Add search query
  if (query && query.trim()) {
    params.append("keyword", query.trim());
    params.append("order[relevance]", "desc");
  } else {
    // Default sort for browsing
    params.append("order[views_30d]", "desc");
  }

  // Add pagination
  params.append("limit", "50");
  params.append("page", page.toString());

  // Add filters if provided
  if (filters) {
    // Sort
    if (filters.sort) {
      if (filters.sort === "relevance") {
        params.append("order[relevance]", "desc");
      } else if (filters.sort === "views_30d") {
        params.append("order[views_30d]", "desc");
      } else if (filters.sort === "chapter_updated_at") {
        params.append("order[chapter_updated_at]", "desc");
      } else if (filters.sort === "created_at") {
        params.append("order[created_at]", "desc");
      } else if (filters.sort === "title") {
        params.append("order[title]", "asc");
      } else if (filters.sort === "year") {
        params.append("order[year]", "desc");
      } else if (filters.sort === "total_views") {
        params.append("order[total_views]", "desc");
      }
    }

    // Status
    if (filters.status && Array.isArray(filters.status)) {
      filters.status.forEach((status: string) => {
        params.append("statuses[]", status);
      });
    }

    // Type
    if (filters.type && Array.isArray(filters.type)) {
      filters.type.forEach((type: string) => {
        params.append("types[]", type);
      });
    }

    // Demographic
    if (filters.demographic && Array.isArray(filters.demographic)) {
      filters.demographic.forEach((demo: string) => {
        params.append("demographics[]", demo);
      });
    }

    // Genres (include)
    if (filters.genres && Array.isArray(filters.genres)) {
      filters.genres.forEach((genre: string) => {
        params.append("genres[]", genre);
      });
    }

    // Year from
    if (filters.year_from) {
      params.append("release_year[from]", filters.year_from);
    }

    // Year to
    if (filters.year_to) {
      params.append("release_year[to]", filters.year_to);
    }

    // Min chapters
    if (filters.min_chapters) {
      params.append("min_chap", filters.min_chapters);
    }
  }

  const url = `${API_URL}/manga?${params.toString()}`;
  const response = await client.get(url);
  const data: SearchResponse = typeof response === "string"
    ? JSON.parse(response)
    : response;
  return data;
}

// Get all chapters for a manga
export async function getAllChapters(
  hashId: string,
  client: SimpleNetworkClient
): Promise<Chapter[]> {
  const chapters: ComixChapter[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${API_URL}/manga/${hashId}/chapters?order[number]=desc&limit=100&page=${page}`;
    const response = await client.get(url);
    const data: ChapterListResponse = typeof response === "string"
      ? JSON.parse(response)
      : response;

    chapters.push(...data.result.items);

    hasMore = data.result.pagination.current_page < data.result.pagination.last_page;
    page++;
  }

  // Deduplicate chapters (prefer official, then highest votes, then most recent)
  const chapterMap = new Map<number, ComixChapter>();

  for (const chapter of chapters) {
    const key = chapter.number;
    const existing = chapterMap.get(key);

    if (!existing) {
      chapterMap.set(key, chapter);
      continue;
    }

    // Determine if current chapter is better than existing
    const officialNew = chapter.scanlation_group_id === OFFICIAL_GROUP_ID;
    const officialExisting = existing.scanlation_group_id === OFFICIAL_GROUP_ID;

    let isBetter = false;
    if (officialNew && !officialExisting) {
      isBetter = true;
    } else if (!officialNew && officialExisting) {
      isBetter = false;
    } else {
      // Both official or both not official, compare votes then updatedAt
      if (chapter.votes > existing.votes) {
        isBetter = true;
      } else if (chapter.votes === existing.votes) {
        isBetter = chapter.updated_at > existing.updated_at;
      }
    }

    if (isBetter) {
      chapterMap.set(key, chapter);
    }
  }

  // Convert to Suwatte chapters
  const dedupedChapters = Array.from(chapterMap.values());
  
  return dedupedChapters.map((chapter, index) => {
    let title = "Chapter " + formatChapterNumber(chapter.number);
    if (chapter.name) {
      title += ": " + chapter.name;
    }

    return {
      chapterId: buildChapterId(chapter.chapter_id),
      number: chapter.number,
      title,
      language: "en",
      date: new Date(chapter.updated_at * 1000),
      index,
      providers: chapter.scanlation_group ? [{
        id: chapter.scanlation_group_id.toString(),
        name: chapter.scanlation_group.name,
      }] : [{
        id: "unknown",
        name: "Unknown",
      }],
      webUrl: `${BASE_URL}/title/${hashId}/${chapter.chapter_id}`,
    };
  });
}

// Get chapter data (pages)
export async function getChapterData(
  chapterId: string,
  client: SimpleNetworkClient
): Promise<ChapterData> {
  const url = `${API_URL}/chapters/${chapterId}`;
  const response = await client.get(url);
  const data: ChapterDataResponse = typeof response === "string"
    ? JSON.parse(response)
    : response;

  if (!data.result || !data.result.images || data.result.images.length === 0) {
    throw new Error(`No images found for chapter ${chapterId}`);
  }

  return {
    pages: data.result.images.map((imageUrl, index) => {
      try {
        // Try to decode as base64 in case API returns encoded URLs
        const decodedUrl = typeof atob !== "undefined" ? atob(imageUrl) : imageUrl;
        return { url: decodedUrl };
      } catch {
        // If not base64, use as is
        return { url: imageUrl };
      }
    }),
  };
}

// Get popular manga
export async function getPopularManga(
  client: SimpleNetworkClient,
  page: number = 1
): Promise<SearchResponse> {
  const params = makeParams();
  params.append("order[views_30d]", "desc");
  params.append("limit", "50");
  params.append("page", page.toString());

  const url = `${API_URL}/manga?${params.toString()}`;
  const response = await client.get(url);
  const data: SearchResponse = typeof response === "string"
    ? JSON.parse(response)
    : response;
  return data;
}

// Get latest updates
export async function getLatestManga(
  client: SimpleNetworkClient,
  page: number = 1
): Promise<SearchResponse> {
  const params = makeParams();
  params.append("order[chapter_updated_at]", "desc");
  params.append("limit", "50");
  params.append("page", page.toString());

  const url = `${API_URL}/manga?${params.toString()}`;
  const response = await client.get(url);
  const data: SearchResponse = typeof response === "string"
    ? JSON.parse(response)
    : response;
  return data;
}