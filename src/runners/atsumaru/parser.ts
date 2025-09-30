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

  if (statusLower.includes("ongoing") || statusLower.includes("publishing")) {
    return PublicationStatus.ONGOING;
  }
  if (statusLower.includes("completed") || statusLower.includes("finished")) {
    return PublicationStatus.COMPLETED;
  }
  if (statusLower.includes("hiatus") || statusLower.includes("paused")) {
    return PublicationStatus.HIATUS;
  }
  if (
    statusLower.includes("cancelled") ||
    statusLower.includes("canceled") ||
    statusLower.includes("dropped")
  ) {
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
    // Try the detailed page API first
    const apiUrl = `https://atsu.moe/api/manga/page?id=${rawId}`;
    const detailResponse = await fetchText(apiUrl, client);

    if (!detailResponse) {
      throw new Error("Empty response from detailed API");
    }

    const detailedData: any = JSON.parse(detailResponse);
    const mangaData = (detailedData as any)?.mangaPage || detailedData;

    // Attempt to enrich/merge chapters from both detailed and info endpoints.
    // The detailed API is preferred for richer metadata, but the lightweight
    // info endpoint currently contains the correct chapter list for some series.
    try {
      const infoUrl = `https://atsu.moe/api/manga/info?mangaId=${rawId}`;
      const infoResp = await fetchText(infoUrl, client);
      if (infoResp) {
        const infoData = JSON.parse(infoResp);
        if (
          infoData?.chapters &&
          Array.isArray(infoData.chapters) &&
          infoData.chapters.length > 0
        ) {
          const detailedChapters = Array.isArray(mangaData?.chapters)
            ? mangaData.chapters
            : [];
          // Merge lists, preferring detailed entries when duplicates exist.
          mangaData.chapters = mergeChapterLists(
            detailedChapters,
            infoData.chapters,
          );
        }
      }
    } catch {
      // ignore failures and continue with whatever we have
    }

    if (mangaData?.title) {
      const synopsis = mangaData.synopsis;

      const result = {
        title: mangaData.englishTitle || mangaData.title,
        cover: mangaData.poster?.image
          ? proxifyImage(`https://atsu.moe${mangaData.poster.image}`)
          : mangaData.poster?.id
            ? proxifyImage(`https://atsu.moe/static/${mangaData.poster.id}`)
            : "/assets/cubari_logo.png",
        summary:
          synopsis ||
          `No description available for "${
            mangaData.englishTitle || mangaData.title
          }"`,
        description:
          synopsis ||
          `No description available for "${
            mangaData.englishTitle || mangaData.title
          }"`,
        creators: mangaData.authors?.map((author: any) => author.name) || [],
        status: mangaData.status
          ? getPublicationStatus(mangaData.status)
          : undefined,
        chapters: mangaData.chapters
          ? convertApiChapters(mangaData.chapters, rawId)
          : [],
        properties: mangaData.tags
          ? ([
              {
                id: "tags",
                title: "Tags",
                tags: mangaData.tags.map(
                  (tag: any) => ({
                    id: tag.id || tag.name,
                    name: tag.name,
                    title: tag.name,
                  }) as any,
                ),
              },
            ] as any)
          : [],
      };

      return result;
    }
  } catch (_error) {
    // Continue to fallback
  }

  // Fallback to home page data
  try {
    const homeApiResponse = await fetchText(
      "https://atsu.moe/api/home/page",
      client,
    );
    const homeData: any = JSON.parse(homeApiResponse);

    if (homeData?.homePage?.sections) {
      for (const section of homeData.homePage.sections) {
        if (section.items) {
          for (const item of section.items) {
            if ((item.id || item.slug) === rawId && item.title) {
              const posterUrl = item.banner || item.image;
              return {
                title: item.title,
                cover: posterUrl
                  ? proxifyImage(posterUrl)
                  : "/assets/cubari_logo.png",
                summary:
                  item.synopsis ||
                  item.description ||
                  item.summary ||
                  `No description available for "${item.title}"`,
                creators: undefined,
                chapters: (item as any)?.chapters
                  ? convertApiChapters((item as any).chapters, rawId)
                  : [],
                properties: (item as any)?.tags
                  ? ([
                      {
                        id: "tags",
                        title: "Tags",
                        tags: (item as any).tags.map(
                          (tag: any) => ({
                            id: tag.id || tag.name,
                            name: tag.name,
                            title: tag.name,
                          }) as any,
                        ),
                      },
                    ] as any)
                  : [],
              };
            }
          }
        }
      }
    }
  } catch (_error) {
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
  page: number = 1,
  perPage: number = 12,
): Promise<SearchResponse | null> {
  try {
    const q = query.trim();
    const qLower = q.toLowerCase();
    const encodedQuery = encodeURIComponent(q);
    if (!encodedQuery) return null;

    const p = Math.max(1, Number(page) || 1);
    const pp = Math.max(1, Number(perPage) || 12);

    const baseParams =
      `?q=${encodedQuery}` +
      `&per_page=${pp}` +
      `&page=${p}` +
      `&query_by=title%2CenglishTitle%2CotherNames` +
      `&query_by_weights=3%2C2%2C1` +
      `&include_fields=id%2Ctitle%2CenglishTitle%2Cposter` +
      `&prioritize_exact_match=true` +
      `&prefix=true`;

    const primaryUrl =
      `https://atsu.moe/collections/manga/documents/search` +
      baseParams +
      `&_=${Date.now()}` +
      `&cb=${Math.random().toString(36).slice(2)}`;

    const fallbackUrl =
      `https://atsu.moe/collections/manga/documents/search` +
      baseParams +
      `&infix=always&drop_tokens_threshold=0` +
      `&_=${Date.now() + 1}` +
      `&cb=${Math.random().toString(36).slice(2)}`;

    const parseSafe = (txt: string | null): any | null => {
      if (!txt) return null;
      try {
        return JSON.parse(txt);
      } catch {
        return null;
      }
    };

    const hasExact = (hits: any[]): boolean =>
      hits?.some((h: any) => {
        const d = h?.document || {};
        const t1 = String(d.englishTitle || "").toLowerCase();
        const t2 = String(d.title || "").toLowerCase();
        return t1 === qLower || t2 === qLower;
      }) ?? false;

    const hasPrefix = (hits: any[]): boolean =>
      hits?.some((h: any) => {
        const d = h?.document || {};
        const t1 = String(d.englishTitle || "").toLowerCase();
        const t2 = String(d.title || "").toLowerCase();
        return t1.startsWith(qLower) || t2.startsWith(qLower);
      }) ?? false;

    const hasGood = (hits: any[]): boolean => hasExact(hits) || hasPrefix(hits);

    const pStart = Date.now();
    const pPromise = fetchText(primaryUrl, client)
      .then((txt) => ({ txt, elapsed: Date.now() - pStart }))
      .catch(() => ({ txt: null as any, elapsed: Date.now() - pStart }));

    const fStart = Date.now();
    const fPromise = fetchText(fallbackUrl, client)
      .then((txt) => ({ txt, elapsed: Date.now() - fStart }))
      .catch(() => ({ txt: null as any, elapsed: Date.now() - fStart }));

    const [{ txt: pText }, { txt: fText }] = await Promise.all([
      pPromise,
      fPromise,
    ]);

    const primary = parseSafe(pText);
    const fallback = parseSafe(fText);

    const pCount = primary?.hits?.length ?? 0;
    const fCount = fallback?.hits?.length ?? 0;

    const pGood = pCount ? hasGood(primary.hits) : false;
    const fGood = fCount ? hasGood(fallback.hits) : false;

    if (pCount && pGood) {
      return primary;
    }
    if (fCount && fGood) {
      return fallback;
    }

    if (pCount || fCount) {
      return pCount >= fCount ? primary : fallback;
    }

    return null;
  } catch {
    return null;
  }
}

export function mergeChapterLists(detailed?: any[], info?: any[]): any[] {
  // Combine info first then detailed so detailed items overwrite info items for same ids.
  const combined = [...(info ?? []), ...(detailed ?? [])];

  const map = new Map<string, any>();
  for (const c of combined) {
    if (!c) continue;
    const id =
      c.id ?? c.chapterId ?? c._id ?? String(c.number ?? c.index ?? Math.random());
    map.set(id, c);
  }

  const arr = Array.from(map.values());

  // Sort by numeric index/number descending (newest-first) when available.
  arr.sort((a: any, b: any) => {
    const ai = Number(a?.index ?? a?.number ?? 0);
    const bi = Number(b?.index ?? b?.number ?? 0);
    if (bi !== ai) return bi - ai;
    return String(b?.id ?? "").localeCompare(String(a?.id ?? ""));
  });

  return arr;
}

export function convertApiChapters(
  apiChapters: any[],
  contentId: string,
): Chapter[] {
  if (!apiChapters || apiChapters.length === 0) {
    return [];
  }

  // Detect what fields are available on the chapters returned by different endpoints.
  const hasIndex = apiChapters.some(
    (c: any) => c.index !== undefined && c.index !== null,
  );
  const hasNumber = apiChapters.some(
    (c: any) => c.number !== undefined && c.number !== null,
  );

  // Create a stable copy and sort newest-first.
  const copy = [...apiChapters];

  if (hasIndex) {
    copy.sort((a: any, b: any) => Number(b.index ?? 0) - Number(a.index ?? 0));
  } else if (hasNumber) {
    copy.sort(
      (a: any, b: any) => Number(b.number ?? 0) - Number(a.number ?? 0),
    );
  } else {
    // If no numeric ordering is provided, assume the array is oldest->newest and reverse it.
    copy.reverse();
  }

  const result = copy.map((chapter: any, idx: number) => {
    // Prefer explicit id fields, fall back to generated values if missing.
    const id =
      chapter.id ??
      chapter._id ??
      String(chapter.slug ?? chapter.title ?? idx);
    const chapterNumber =
      chapter.number !== undefined && chapter.number !== null
        ? Number(chapter.number)
        : hasIndex && chapter.index !== undefined && chapter.index !== null
          ? Number(chapter.index)
          : idx + 1;

    // Robust date parsing with fallbacks.
    let dateObj: Date | undefined;

    // Try common fields first
    if (chapter.createdAt !== undefined && chapter.createdAt !== null) {
      // Accept numbers or strings
      if (typeof chapter.createdAt === "number") {
        dateObj = new Date(chapter.createdAt);
      } else {
        dateObj = parseDateLike(String(chapter.createdAt));
        if (!dateObj) {
          const n = Number(chapter.createdAt);
          if (!Number.isNaN(n)) dateObj = new Date(n);
        }
      }
    }

    if (
      !dateObj &&
      chapter.publishedAt !== undefined &&
      chapter.publishedAt !== null
    ) {
      if (typeof chapter.publishedAt === "number") {
        dateObj = new Date(chapter.publishedAt);
      } else {
        dateObj = parseDateLike(String(chapter.publishedAt));
        if (!dateObj) {
          const n = Number(chapter.publishedAt);
          if (!Number.isNaN(n)) dateObj = new Date(n);
        }
      }
    }

    // Some endpoints may expose UNIX timestamps in seconds under different keys
    if (
      !dateObj &&
      (chapter.timestamp !== undefined && chapter.timestamp !== null)
    ) {
      const n = Number(chapter.timestamp);
      if (!Number.isNaN(n)) {
        // Heuristic: if value looks like seconds (<= 1e10), convert to ms
        dateObj = n > 1e10 ? new Date(n) : new Date(n * 1000);
      }
    }

    // Final deterministic fallback: generate a stable date based on index so key exists
    if (!dateObj) {
      // Use epoch + index seconds so serialized dates are valid ISO strings and deterministic
      dateObj = new Date(1000 * idx);
    }

    return {
      id,
      chapterId: id,
      number: chapterNumber,
      title: chapter.title || `Chapter ${chapterNumber}`,
      date: dateObj,
      language: "en",
      index: idx,
      pageCount: chapter.pageCount ?? chapter.pages ?? 0,
      progress: null,
    } as Chapter;
  });

  return result;
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
  } catch (_error) {
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
    } catch (_error) {
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

    const title: string =
      s.title || (s.type === "slideshow" ? "Featured" : "Browse");
    const section: PageSection = {
      id: (s.key as string) || title.toLowerCase().replace(/\s+/g, "_"),
      title,
      items,
      style:
        s.type === "slideshow" ? SectionStyle.GALLERY : SectionStyle.STANDARD_GRID,
    } as any;
    out.push(section);
  }

  return out;
}
