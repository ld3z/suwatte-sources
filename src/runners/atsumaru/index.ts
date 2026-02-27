import {
  Chapter,
  ChapterData,
  Content,
  ContentSource,
  DirectoryConfig,
  DirectoryRequest,
  Highlight,
  ImageRequestHandler,
  NetworkRequest,
  PageLink,
  PageLinkResolver,
  PagedResult,
  PageSection,
  ResolvedPageSection,
  SectionStyle,
  Property,
} from "@suwatte/daisuke";
import { INFO } from "./constants";
import {
  buildSeriesId,
  parseSeriesId,
  extractHomeSectionsFromPrefetch,
  getSeriesById,
  getChapterData,
  fetchAllChapters,
  searchManga,
} from "./parser";
import {
  fetchText,
  SimpleNetworkClient,
  proxifyImage,
} from "./helpers";

export class Target
  implements ContentSource, ImageRequestHandler, PageLinkResolver
{
  info = INFO;
  private client: SimpleNetworkClient = new NetworkClient();
  private lastQuery: string | null = null;
  // Small in-memory cache to avoid requiring a second identical query
  private lastQueryNormalized: string | null = null;
  private lastExactResults: Highlight[] | null = null;

  private fetcher = (url: string) => fetchText(url, this.client);

  // --- PageLinkResolver ---
  async resolvePageSection(
    _link: PageLink,
    _sectionID: string,
  ): Promise<ResolvedPageSection> {
    throw new Error("Method not used.");
  }

  private topSearchedSection(): PageSection {
    return {
      id: "top_searched",
      title: "Top searched",
      style: SectionStyle.PADDED_LIST,
      items: [
        {
          id: "popular",
          title: "Popular on Atsumaru",
          subtitle: "Shows the popular/featured carousel from the homepage.",
          cover: "/assets/atsu_logo.png",
        },
      ],
    };
  }

  async getSectionsForPage(_link: PageLink): Promise<PageSection[]> {
    const base = "https://atsu.moe/";
    const apiUrl = "https://atsu.moe/api/home/page";

    try {
      const apiResponse = await this.fetcher(apiUrl);
      return extractHomeSectionsFromPrefetch(apiResponse, base);
    } catch {
      return [this.topSearchedSection()];
    }
  }

  // --- ContentSource ---
  async getContent(contentId: string): Promise<Content> {
    const { slug } = parseSeriesId(contentId);

    // Get content using the detailed API
    const content = await getSeriesById(slug, this.client);
    if (content) {
      return content;
    }

    // If we couldn't fetch content (likely offline), signal the app to use cached metadata
    throw new Error("Content unavailable (offline)");
  }

  async getChapters(contentId: string): Promise<Chapter[]> {
    const { slug } = parseSeriesId(contentId);
    try {
      const chapters = await fetchAllChapters(slug, this.client);
      return chapters;
    } catch {
      // Offline or failed fetch: surface error so the app can fall back to cached chapters
      throw new Error("Chapters unavailable (offline)");
    }
  }

  async getChapterData(
    contentId: string,
    chapterId: string,
  ): Promise<ChapterData> {
    const { slug } = parseSeriesId(contentId);
    const chapterData = await getChapterData(slug, chapterId, this.client);

    if (!chapterData) {
      // Signal failure so the app can use its cached chapter pages if available
      throw new Error(`Failed to fetch chapter data for ${chapterId}`);
    }

    return {
      pages: chapterData.pages.map((page: any) => {
        const imageUrl = /^https?:\/\//i.test(page.image)
          ? page.image
          : `https://atsu.moe${page.image}`;
        return {
          url: imageUrl,
          width: page.width,
          height: page.height,
        };
      }),
    } as ChapterData;
  }

  // Removed getTags method to hide filter interface
  // The filter interface won't appear since this method doesn't exist

  async getDirectory(query: DirectoryRequest): Promise<PagedResult> {
    const q = (query.query ?? "").trim();
    if (!q) {
      // Try to fetch homepage sections and return the popular/featured carousel items
      try {
        const base = "https://atsu.moe/";
        const apiUrl = "https://atsu.moe/api/home/page";
        const apiResponse = await this.fetcher(apiUrl);
        const sections = await extractHomeSectionsFromPrefetch(apiResponse, base);
        if (sections && sections.length > 0) {
          // Prefer sections that look like popular/featured carousels: gallery/slideshow or titles containing "popular"/"featured"
          let chosen: PageSection | undefined = sections.find((s: PageSection) =>
            (s.title && /popular|featured/i.test(s.title)) || s.style === SectionStyle.GALLERY,
          );
          // Fallback to the first section that has items
          if (!chosen) {
            chosen = sections.find((s: PageSection) => Array.isArray(s.items) && (s.items as any[]).length > 0);
          }
          if (chosen && Array.isArray(chosen.items) && (chosen.items as any).length > 0) {
            // Normalize and ensure each item has an absolute/proxied cover URL so the UI can render thumbnails.
            const rawItems = chosen.items as any[];
            const normalized: Highlight[] = rawItems.map((it: any) => {
              const coverSource = it.cover || it.image || it.banner || "";
              let coverUrl = String(coverSource || "");
              // If coverUrl is a relative path, make it absolute against base.
              // Prefer canonical /static/posters for poster resources so URLs become
              // https://atsu.moe/static/posters/...
              if (coverUrl && !/^https?:\/\//i.test(coverUrl)) {
                const cleaned = coverUrl.replace(/^\//, "");
                if (/^posters\//i.test(cleaned)) {
                  // Convert "posters/..." -> "/static/posters/..."
                  coverUrl = `${base.replace(/\/$/, "")}/static/${cleaned}`;
                } else if (/^static\/posters\//i.test(cleaned)) {
                  // Already under static/posters
                  coverUrl = `${base.replace(/\/$/, "")}/${cleaned}`;
                } else {
                  // Generic site-relative path
                  coverUrl = `${base.replace(/\/$/, "")}/${cleaned}`;
                }
              }
              const cover = coverUrl ? proxifyImage(coverUrl) : "/assets/atsu_logo.png";
              const id = it.id || it.slug || (it as any)?.href || "";
              return {
                id,
                title: it.title || it.name || "Series",
                cover,
                subtitle: it.subtitle || (it.chapter && it.chapter.title) || undefined,
              } as Highlight;
            });
            return { results: normalized, isLastPage: true };
          }
        }
      } catch {
        // Ignore errors and fall back to a simple placeholder below
      }
      // Final fallback if homepage couldn't be fetched or no suitable section found
      return {
        results: [
          {
            id: "top_searched",
            title: "Top searched",
            cover: "/assets/atsu_logo.png",
            subtitle: "Browse popular titles from the homepage",
          },
        ],
        isLastPage: true,
      };
    }

    // Direct link resolution removed; rely solely on the search API

    // Otherwise, use search API
    try {
      let page = Math.max(1, Number((query as any).page ?? 1));

      // Allow larger pages; default to 24, cap to a safe upper bound
      const perPageRaw =
        (query as any).pageSize ??
        (query as any).limit ??
        (query as any).perPage ??
        24;
      const perPage = Math.max(12, Math.min(48, Number(perPageRaw) || 24));

      

      // Define normalization here so we can check page-1 concurrently for exact matches.
      const normalizeTitle = (s: string): string =>
        (s || "")
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "") // strip diacritics
          .toLowerCase()
          .replace(/['’`´]/g, "") // strip apostrophes/backticks/acute
          .replace(/[^a-z0-9]+/g, " ") // collapse punctuation to spaces
          .trim();
      const nq = normalizeTitle(q);
 
      let searchResults: any = null;
 
      if (page > 1) {
        // Run the requested page and page=1 concurrently. If page=1 contains an exact normalized match
        // prefer and return that immediately (handles UIs that preserve page state).
        const [pageRes, topRes] = await Promise.all([
          searchManga(q, this.client, page, perPage),
          searchManga(q, this.client, 1, perPage),
        ]);
 
        // If top page has exact normalized matches, return them immediately.
        if (topRes && Array.isArray(topRes.hits)) {
          const exactOnTop = topRes.hits.filter((h: any) => {
            const d = h?.document || {};
            const tEnN = normalizeTitle(String(d.englishTitle || ""));
            const tN = normalizeTitle(String(d.title || ""));
            return tEnN === nq || tN === nq;
          });
 
          if (exactOnTop.length > 0) {
            // Group exact hits by their normalized title and pick the single best entry per normalized title.
            // This avoids showing multiple near-duplicate entries for the same normalized title.
            const bestMap = new Map<string, any>();
            for (const h of exactOnTop) {
              const d = h?.document || {};
              const key = normalizeTitle(String(d.englishTitle || d.title || ""));
              const existing = bestMap.get(key);
              if (!existing) {
                bestMap.set(key, h);
                continue;
              }
 
              const existingScore = Number(existing?.text_match ?? 0);
              const currentScore = Number(h?.text_match ?? 0);
 
              // Prefer higher server rank (text_match). If equal, prefer the entry that has a poster.
              if (currentScore > existingScore) {
                bestMap.set(key, h);
              } else if (currentScore === existingScore) {
                const existingHasPoster = !!(existing?.document?.poster);
                const currentHasPoster = !!(h?.document?.poster);
                if (!existingHasPoster && currentHasPoster) {
                  bestMap.set(key, h);
                }
              }
            }
 
            const bestHits = Array.from(bestMap.values());
            const results: Highlight[] = bestHits.map((h: any) => {
              const doc = h.document || {};
              const hl: any = h.highlight || {};
              const hlList: any[] = Array.isArray(h.highlights) ? h.highlights : [];
 
              const rawSnippet =
                (hl.title && hl.title.snippet) ??
                (hl.englishTitle && hl.englishTitle.snippet) ??
                (hlList.find(x => x?.field === "title")?.snippet) ??
                (hlList.find(x => x?.field === "englishTitle")?.snippet) ??
                "";
 
              const cleanSnippet = String(rawSnippet).replace(/<[^>]*>/g, "").trim();
 
              return {
                id: buildSeriesId(doc.id),
                title: doc.englishTitle || doc.title,
                cover: doc.poster ? proxifyImage(`https://atsu.moe${doc.poster}`) : "/assets/cubari_logo.png",
                subtitle: cleanSnippet || undefined,
              } as Highlight;
            });
 
            return { results, isLastPage: true };
          }
        }
 
        // Otherwise continue using the requested page results
        searchResults = pageRes;
      } else {
        // page === 1: do standard fetch with transient retry
        searchResults = await searchManga(q, this.client, page, perPage);
 
        // Transient failures sometimes cause the first attempt to return empty.
        // Retry up to 2 additional times immediately for page 1 to improve perceived reliability.
        if (
          (!searchResults ||
            !Array.isArray((searchResults as any).hits) ||
            (searchResults as any).hits.length === 0)
        ) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const retryAttempt = await searchManga(q, this.client, page, perPage);
              if (retryAttempt && Array.isArray((retryAttempt as any).hits) && (retryAttempt as any).hits.length > 0) {
                searchResults = retryAttempt as any;
                break;
              } else {
                // retry returned no hits
              }
            } catch (e: any) {
              // ignore transient retry failures and continue attempts
            }
          }
        }
      }
 
      // If requested page > 1 and the API returns no hits, fallback to page 1 to avoid an empty screen
      if ((!searchResults || !Array.isArray((searchResults as any).hits) || (searchResults as any).hits.length === 0) && page > 1) {
        
        const retry = await searchManga(q, this.client, 1, perPage);
        if (retry && Array.isArray((retry as any).hits) && (retry as any).hits.length > 0) {
          page = 1; // normalize for isLastPage calc and logs
          searchResults = retry as any;
        }
      }

      if (searchResults && Array.isArray(searchResults.hits) && searchResults.hits.length > 0) {
        // Normalize titles to make matching apostrophe/diacritic/spacing-insensitive
        const normalizeTitle = (s: string): string =>
          (s || "")
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "") // strip diacritics
            .toLowerCase()
            .replace(/['’`´]/g, "") // strip apostrophes/backticks/acute
            .replace(/[^a-z0-9]+/g, " ") // collapse punctuation to spaces
            .trim();

        const nq = normalizeTitle(q);

        // If there is an exact normalized title match, return ONLY those matches
        const exactHits = searchResults.hits.filter((h: any) => {
          const d = h?.document || {};
          const tEnN = normalizeTitle(String(d.englishTitle || ""));
          const tN = normalizeTitle(String(d.title || ""));
          return tEnN === nq || tN === nq;
        });
 
        if (exactHits.length > 0) {
          // Select the best entry per normalized title to avoid duplicate listings.
          const bestMap = new Map<string, any>();
          for (const h of exactHits) {
            const d = h?.document || {};
            const key = normalizeTitle(String(d.englishTitle || d.title || ""));
            const existing = bestMap.get(key);
            if (!existing) {
              bestMap.set(key, h);
              continue;
            }
 
            const existingScore = Number(existing?.text_match ?? 0);
            const currentScore = Number(h?.text_match ?? 0);
 
            if (currentScore > existingScore) {
              bestMap.set(key, h);
            } else if (currentScore === existingScore) {
              const existingHasPoster = !!(existing?.document?.poster);
              const currentHasPoster = !!(h?.document?.poster);
              if (!existingHasPoster && currentHasPoster) {
                bestMap.set(key, h);
              }
            }
          }
 
          const bestHits = Array.from(bestMap.values());
          const results: Highlight[] = bestHits.map((h: any) => {
            const doc = h.document || {};
            const hl: any = h.highlight || {};
            const hlList: any[] = Array.isArray(h.highlights) ? h.highlights : [];
 
            // Prefer field-specific highlight; fall back to any available snippet
            const rawSnippet =
              (hl.title && hl.title.snippet) ??
              (hl.englishTitle && hl.englishTitle.snippet) ??
              (hlList.find(x => x?.field === "title")?.snippet) ??
              (hlList.find(x => x?.field === "englishTitle")?.snippet) ??
              "";
 
            const cleanSnippet = String(rawSnippet).replace(/<[^>]*>/g, "").trim();
 
            return {
              id: buildSeriesId(doc.id),
              title: doc.englishTitle || doc.title,
              cover: doc.poster ? proxifyImage(`https://atsu.moe${doc.poster}`) : "/assets/cubari_logo.png",
              subtitle: cleanSnippet || undefined,
            } as Highlight;
          });
 
          return {
            results,
            isLastPage: true, // exact match found; don't show additional results
          };
        }

        // Otherwise, rank results: normalized-exact matches first, then by server ranking, then stable index
        const scored: { h: any; idx: number; exactScore: number; rank: number }[] = searchResults.hits.map((h: any, idx: number) => {
          const d = h?.document || {};
          const tEnN = normalizeTitle(String(d.englishTitle || ""));
          const tN = normalizeTitle(String(d.title || ""));
          const exactScore = tEnN === nq ? 2 : tN === nq ? 1 : 0;
          const rank = Number(h?.text_match ?? 0);
          return { h, idx, exactScore, rank };
        });
 
        scored.sort((a: { exactScore: number; rank: number; idx: number }, b: { exactScore: number; rank: number; idx: number }) => {
          if (b.exactScore !== a.exactScore) return b.exactScore - a.exactScore;
          if (b.rank !== a.rank) return b.rank - a.rank;
          return a.idx - b.idx;
        });
 
        const results: Highlight[] = scored.map(({ h }: { h: any }) => {
          const doc = (h as any).document || {};
          const hl: any = (h as any).highlight || {};
          const hlList: any[] = Array.isArray((h as any).highlights) ? (h as any).highlights : [];
 
          // Prefer field-specific highlight; fall back to any available snippet
          const rawSnippet =
            (hl.title && hl.title.snippet) ??
            (hl.englishTitle && hl.englishTitle.snippet) ??
            (hlList.find((x: any) => x?.field === "title")?.snippet) ??
            (hlList.find((x: any) => x?.field === "englishTitle")?.snippet) ??
            "";
 
          const cleanSnippet = String(rawSnippet).replace(/<[^>]*>/g, "").trim();
 
          return {
            id: buildSeriesId(doc.id),
            title: doc.englishTitle || doc.title,
            cover: doc.poster ? proxifyImage(`https://atsu.moe${doc.poster}`) : "/assets/cubari_logo.png",
            subtitle: cleanSnippet || undefined,
          } as Highlight;
        });
 
        // Deduplicate results by id while preserving order to avoid duplicate entries from multiple pages
        const uniqueResults: Highlight[] = [];
        const seenIds = new Set<string>();
        for (const r of results) {
          if (!r || !r.id) continue;
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            uniqueResults.push(r);
          }
        }
 
        // Update lightweight cache for immediate identical queries (normalize before storing)
        try {
          this.lastQueryNormalized = (q || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’`´]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
          this.lastExactResults = uniqueResults.slice(0, 50);
        } catch {}
 
        // Use 'found' (total hits for this query) when available; otherwise fall back to unique result count
        const totalFound = (searchResults as any).found ?? uniqueResults.length;
        const isLastPage = uniqueResults.length < perPage || page * perPage >= totalFound;
 
        return {
          results: uniqueResults,
          isLastPage,
        };
      }
    } catch (_error) {
      // Search failed, continue to fallback
    }

    // Final fallback
    const item: Highlight = {
      id: "atsu_no_results",
      title: "No results found",
      cover: "/assets/cubari_logo.png",
      subtitle: `No manga found for "${q}"`,
    };
    return { results: [item], isLastPage: true };
  }

  async getDirectoryConfig(): Promise<DirectoryConfig> {
    return { filters: [] };
  }

  // --- ImageRequestHandler ---
  async willRequestImage(url: string): Promise<NetworkRequest> {
    return { url, headers: { Referer: "https://atsu.moe/" } };
  }
}
