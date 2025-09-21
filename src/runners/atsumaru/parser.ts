import {
  Chapter,
  Content,
  Highlight,
  PageSection,
  SectionStyle,
  PublicationStatus,
} from "@suwatte/daisuke";
import { fetchText, proxifyImage, SimpleNetworkClient } from "./helpers";
import {
  JSONSchema,
  HomePage,
  Section,
  Item,
  MangaPage,
  ChapterInfo,
  MangaPageResponse,
  SearchResponse,
} from "./types";

export type AtsuParsed = {
  slug: string;
  seriesUrl: string;
};

export function parseAtsuUrl(input: string): AtsuParsed | null {
  const s = input.trim();
  const u = (() => {
    try {
      return new URL(s);
    } catch {
      try {
        return new URL("https://" + s);
      } catch {
        return null;
      }
    }
  })();
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "atsu.moe") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && (parts[0] === "series" || parts[0] === "manga")) {
    const slug = parts[1];
    return { slug, seriesUrl: new URL(`/series/${slug}`, u.origin).toString() };
  }
  return null;
}

export function buildSeriesId(slug: string) {
  return `atsu|${slug}`;
}

export function parseSeriesId(id: string): {
  slug: string;
  seriesUrlCandidates: string[];
} {
  const [type, slug] = id.split("|");
  if (type !== "atsu" || !slug)
    throw new Error("Unsupported content id; expected atsu|<slug>");
  const base = "https://atsu.moe";
  return {
    slug,
    seriesUrlCandidates: [
      `${base}/series/${slug}/`,
      `${base}/series/${slug}`,
      `${base}/manga/${slug}/`,
      `${base}/manga/${slug}`,
    ],
  };
}

export async function fetchSeriesHtml(
  slug: string,
  client?: SimpleNetworkClient,
): Promise<{ url: string; html: string }> {
  const { seriesUrlCandidates } = parseSeriesId(`atsu|${slug}`);
  for (const url of seriesUrlCandidates) {
    try {
      const html = await fetchText(url, client);
      if (html && html.length > 0) return { url, html };
    } catch {
      // try next
    }
  }
  throw new Error("Failed to load series page");
}

function getPublicationStatus(status: string): PublicationStatus | undefined {
  const statusLower = status.toLowerCase().trim();

  if (statusLower.includes('ongoing') || statusLower.includes('publishing')) {
    return PublicationStatus.ONGOING;
  }
  if (statusLower.includes('completed') || statusLower.includes('finished')) {
    return PublicationStatus.COMPLETED;
  }
  if (statusLower.includes('hiatus') || statusLower.includes('paused')) {
    return PublicationStatus.HIATUS;
  }
  if (statusLower.includes('cancelled') || statusLower.includes('canceled') || statusLower.includes('dropped')) {
    return PublicationStatus.CANCELLED;
  }

  // Default to ONGOING if status is unclear
  return PublicationStatus.ONGOING;
}
export async function getSeriesById(
  rawId: string,
  client?: SimpleNetworkClient,
): Promise<Content | null> {
  try {
    const apiUrl = `https://atsu.moe/api/manga/page?id=${rawId}`;
    const detailResponse = await fetchText(apiUrl, client);

    if (!detailResponse) {
      throw new Error("Empty response from detailed API");
    }

    const detailedData: any = JSON.parse(detailResponse);
    const mangaData = (detailedData as any)?.mangaPage || detailedData;

    if (mangaData?.title) {
      const synopsis = mangaData.synopsis;

      const result = {
        title: mangaData.englishTitle || mangaData.title,
        cover: mangaData.poster?.image
          ? proxifyImage(`https://atsu.moe${mangaData.poster.image}`)
          : mangaData.poster?.id
            ? proxifyImage(`https://atsu.moe/static/${mangaData.poster.id}`)
            : "/assets/cubari_logo.png",
        summary: synopsis || `No description available for "${mangaData.englishTitle || mangaData.title}"`,
        description: synopsis || `No description available for "${mangaData.englishTitle || mangaData.title}"`,
        creators: mangaData.authors?.map((author: any) => author.name) || [],
        status: mangaData.status ? getPublicationStatus(mangaData.status) : undefined,
        chapters: mangaData.chapters ? convertApiChapters(mangaData.chapters, rawId) : [],
        properties: mangaData.tags
          ? [{
              id: "tags",
              title: "Tags",
              tags: mangaData.tags.map((tag: any) => ({
                id: tag.id || tag.name,
                name: tag.name,
                title: tag.name,
              } as any)),
            } as any]
          : [],
      };

      return result;
    }
  } catch (error) {
    // Continue to fallback
  }

  // Fallback to home page data
  try {
    const homeApiResponse = await fetchText("https://atsu.moe/api/home/page", client);
    const homeData: any = JSON.parse(homeApiResponse);

    if (homeData?.homePage?.sections) {
      for (const section of homeData.homePage.sections) {
        if (section.items) {
          for (const item of section.items) {
            if ((item.id || item.slug) === rawId && item.title) {
              const posterUrl = item.banner || item.image;
              return {
                title: item.title,
                cover: posterUrl ? proxifyImage(posterUrl) : "/assets/cubari_logo.png",
                summary: item.synopsis || item.description || item.summary || `No description available for "${item.title}"`,
                creators: undefined,
                chapters: (item as any)?.chapters ? convertApiChapters((item as any).chapters, rawId) : [],
                properties: (item as any)?.tags
                  ? [{
                      id: "tags",
                      title: "Tags",
                      tags: (item as any).tags.map((tag: any) => ({
                        id: tag.id || tag.name,
                        name: tag.name,
                        title: tag.name,
                      } as any)),
                    } as any]
                  : [],
              };
            }
          }
        }
      }
    }
  } catch (error) {
    // Continue to final fallback
  }

  return null;
}

function parseDateLike(s: string): Date | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const parsed = new Date(t);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return undefined;
}

export async function searchManga(
  query: string,
  client?: SimpleNetworkClient,
): Promise<SearchResponse | null> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const apiUrl = `https://atsu.moe/collections/manga/documents/search?q=${encodedQuery}&limit=20&query_by=title%2CenglishTitle%2CotherNames&query_by_weights=3%2C2%2C1&include_fields=id%2Ctitle%2CenglishTitle%2Cposter&num_typos=4%2C3%2C2`;
    const searchResponse = await fetchText(apiUrl, client);

    if (!searchResponse) {
      return null;
    }

    return JSON.parse(searchResponse);
  } catch (error) {
    return null;
  }
}

export function convertApiChapters(apiChapters: any[], contentId: string): Chapter[] {
  if (!apiChapters || apiChapters.length === 0) {
    return [];
  }

  // Sort chapters by number in DESCENDING order (newest first)
  const sortedByNumber = [...apiChapters].sort((a, b) => {
    const numA = a.number || 0;
    const numB = b.number || 0;
    return numB - numA;
  });

  return sortedByNumber.map((chapter, index) => ({
    id: chapter.id,
    chapterId: chapter.id,
    number: chapter.number || (index + 1),
    title: chapter.title || `Chapter ${chapter.number || (index + 1)}`,
    date: new Date(chapter.createdAt),
    language: 'en',
    index: index,
    pageCount: chapter.pageCount || 0,
    progress: null,
  }));
}

export async function getChapterData(
  mangaId: string,
  chapterId: string,
  client?: SimpleNetworkClient,
): Promise<any> {
  try {
    const apiUrl = `https://atsu.moe/api/read/chapter?mangaId=${mangaId}&chapterId=${chapterId}`;
    const chapterResponse = await fetchText(apiUrl, client);

    if (!chapterResponse) {
      return null;
    }

    const chapterData = JSON.parse(chapterResponse);
    return chapterData.readChapter;
  } catch (error) {
    return null;
  }
}

export async function extractHomeSectionsFromPrefetch(
  html: string,
  baseUrl: string,
): Promise<PageSection[]> {
  const m = html.match(/window\.homePage\s*=\s*(\{[\s\S]*?\});/);
  let data: any;

  if (m && m[1]) {
    try {
      data = JSON.parse(m[1]);
    } catch {
      return [];
    }
  } else {
    try {
      data = JSON.parse(html);
      if (data.homePage) data = data.homePage;
    } catch {
      return [];
    }
  }

  const out: PageSection[] = [];
  const secs: any[] = data?.sections ?? [];

  const allMangaIds = new Set<string>();
  for (const s of secs) {
    if (s.items) {
      for (const it of s.items) {
        const rawId: string | undefined = it.id || it.slug;
        if (rawId) {
          allMangaIds.add(rawId);
        }
      }
    }
  }

  const detailedDataMap = new Map<string, any>();

  const fetchPromises = Array.from(allMangaIds).map(async (rawId) => {
    try {
      const apiUrl = `https://atsu.moe/api/manga/page?id=${rawId}`;
      const detailResponse = await fetchText(apiUrl);
      const detailedData = JSON.parse(detailResponse);
      detailedDataMap.set(rawId, detailedData);
    } catch (error) {
      // Silently ignore failed requests
    }
  });

  await Promise.all(fetchPromises);

  const imageMap = new Map<string, string>();
  for (const s of secs) {
    if (s.items) {
      for (const it of s.items) {
        const rawId: string | undefined = it.id || it.slug;
        if (rawId && it.image) {
          imageMap.set(rawId, it.image);
        }
      }
    }
  }

  for (const s of secs) {
    if (!s || (s.type !== "carousel" && s.type !== "slideshow")) continue;

    const items: Highlight[] = [];
    for (const it of s.items ?? []) {
      const rawId: string | undefined = it.id || it.slug;
      if (!rawId) continue;

      const id = buildSeriesId(rawId);
      const title: string = it.title || "Series";

      const detailedData = detailedDataMap.get(rawId);

      let imgPath: string | undefined;
      if ((detailedData as any)?.mangaPage?.poster?.image) {
        imgPath = (detailedData as any).mangaPage.poster.image;
      } else if ((detailedData as any)?.poster?.image) {
        imgPath = (detailedData as any).poster.image;
      } else if ((detailedData as any)?.image) {
        imgPath = (detailedData as any).image;
      } else {
        imgPath = imageMap.get(rawId) || it.banner;
      }

      const cover = imgPath
        ? proxifyImage(`https://atsu.moe${imgPath}`)
        : "/assets/cubari_logo.png";

      const h: Highlight = { id, title, cover } as Highlight;
      if (it.chapter?.title) h.subtitle = it.chapter.title;

      items.push(h);
    }

    if (!items.length) continue;

    const title: string = s.title || (s.type === "slideshow" ? "Featured" : "Browse");
    const section: PageSection = {
      id: (s.key as string) || title.toLowerCase().replace(/\s+/g, "_"),
      title,
      items,
      style: s.type === "slideshow" ? SectionStyle.GALLERY : SectionStyle.STANDARD_GRID,
    } as any;
    out.push(section);
  }

  return out;
}
