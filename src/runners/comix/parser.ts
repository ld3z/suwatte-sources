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
      tags: manga.author.map((a) => ({
        id: a.term_id.toString(),
        title: a.title,
      })),
    });
  }

  if (manga.artist && manga.artist.length > 0) {
    properties.push({
      id: "artist",
      title: "Artist",
      tags: manga.artist.map((a) => ({
        id: a.term_id.toString(),
        title: a.title,
      })),
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
      tags: genreTags.map((tag, index) => ({
        id: `genre_${index}`,
        title: tag,
      })),
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
  const data: SingleMangaResponse =
    typeof response === "string" ? JSON.parse(response) : response;

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
  const data: SearchResponse =
    typeof response === "string" ? JSON.parse(response) : response;
  return data;
}

// Get all chapters for a manga (parallel pagination for speed)
export async function getAllChapters(
  hashId: string,
  client: SimpleNetworkClient
): Promise<Chapter[]> {
  // Fetch first page to get total count
  const firstUrl = `${API_URL}/manga/${hashId}/chapters?order[number]=desc&limit=100&page=1`;
  const firstResponse = await client.get(firstUrl);
  const firstData: ChapterListResponse =
    typeof firstResponse === "string"
      ? JSON.parse(firstResponse)
      : firstResponse;

  const chapters: ComixChapter[] = [...firstData.result.items];
  const totalPages = firstData.result.pagination.last_page;

  // If there's only one page, format and return immediately
  if (totalPages <= 1) {
    return formatChaptersForComix(chapters, hashId);
  }

  // Fetch remaining pages in parallel (max 5 concurrent to respect rate limits)
  const remainingPages = Array.from(
    { length: totalPages - 1 },
    (_, i) => i + 2
  );
  const chunkSize = 5;

  for (let i = 0; i < remainingPages.length; i += chunkSize) {
    const chunk = remainingPages.slice(i, i + chunkSize);
    const promises = chunk.map((pageNum) => {
      const url = `${API_URL}/manga/${hashId}/chapters?order[number]=desc&limit=100&page=${pageNum}`;
      return client.get(url).then((response) => {
        const data: ChapterListResponse =
          typeof response === "string" ? JSON.parse(response) : response;
        return data.result.items;
      });
    });

    const results = await Promise.all(promises);
    results.forEach((items) => chapters.push(...items));
  }

  return formatChaptersForComix(chapters, hashId);
}

// Format raw chapters into Suwatte chapters
function formatChaptersForComix(
  chapters: ComixChapter[],
  hashId: string
): Chapter[] {
  // Sort chapters by number desc, then by official status desc, then by updated_at desc
  chapters.sort((a, b) => {
    if (a.number !== b.number) {
      return b.number - a.number;
    }
    if (a.is_official !== b.is_official) {
      return b.is_official - a.is_official;
    }
    return b.updated_at - a.updated_at;
  });

  // Convert to Suwatte chapters
  return chapters.map((chapter, index) => {
    let title = "Chapter " + formatChapterNumber(chapter.number);
    if (chapter.name) {
      title += ": " + chapter.name;
    }

    let providers = [];
    
    if (chapter.is_official === 1) {
      // Official chapter
      providers.push({
        id: "official",
        name: "Official",
      });
    } else if (chapter.scanlation_group) {
      // Scanlation group chapter
      providers.push({
        id: chapter.scanlation_group_id.toString(),
        name: chapter.scanlation_group.name,
      });
    } else {
      // Unknown provider
      providers.push({
        id: `unknown_${hashId}`,
        name: "Unknown",
      });
    }

    return {
      chapterId: buildChapterId(chapter.chapter_id),
      number: chapter.number,
      title,
      language: "en",
      date: new Date(chapter.updated_at * 1000),
      index,
      providers,
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
  const data: ChapterDataResponse =
    typeof response === "string" ? JSON.parse(response) : response;

  if (!data.result || !data.result.images || data.result.images.length === 0) {
    throw new Error(`No images found for chapter ${chapterId}`);
  }

  return {
    pages: data.result.images.map((image, index) => {
      const imageUrl = image.url;
      try {
        // Try to decode as base64 in case API returns encoded URLs
        const decodedUrl =
          typeof atob !== "undefined" ? atob(imageUrl) : imageUrl;
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
  const data: SearchResponse =
    typeof response === "string" ? JSON.parse(response) : response;
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
  const data: SearchResponse =
    typeof response === "string" ? JSON.parse(response) : response;
  return data;
}
