import {
  Chapter,
  Content,
  ContentRating,
  ContentStatus,
  ContentType,
  Credit,
  Item,
  PagedItemList,
  Tag,
} from "@suwatte/toolchain";
import { load } from "cheerio/slim";

import { BASE_URL } from "./constants";
import { absoluteUrl, escapeHtml, nonEmpty, parseCompactNumber } from "./utils";

const MATURE_GENRES = ["adult", "smut"];
const SUGGESTIVE_GENRES = ["mature", "ecchi"];

/** Tags that can carry chapter text; everything else in `#content` (ads, iframes) is dropped. */
const TEXT_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "hr", "ul", "ol", "table", "pre",
]);

/** Extracts the novel slug from a `/book/{slug}` URL, ignoring chapter URLs. */
export function bookIdFromUrl(url: string | undefined): string | null {
  const match = url?.match(/\/book\/([^/?#]+)\/?(?:[?#]|$)/);
  return match ? match[1] : null;
}

export function bookUrl(contentId: string): string {
  return `${BASE_URL}/book/${contentId}`;
}

// ================================ Listings ================================

/**
 * Parses a novel listing page. `scope` limits parsing to the results list,
 * since some pages also show unrelated "popular" novels.
 */
export function parseListing(html: string, scope = "main"): PagedItemList {
  const $ = load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $(scope)
    .find("li.novel-item")
    .each((_, el) => {
      const $el = $(el);
      const link = $el
        .find('a[href*="/book/"]')
        .toArray()
        .find((a) => bookIdFromUrl($(a).attr("href")));
      const id = bookIdFromUrl(link ? $(link).attr("href") : undefined);
      if (!id || seen.has(id)) return;
      seen.add(id);

      const $img = $el.find("img").first();
      const src = $img.attr("data-src") || $img.attr("src");
      const latestChapter = $el.find(".chapter-title").first().text().trim();
      const chapterCount = $el.text().match(/([\d,]+)\s+Chapters/)?.[1];

      items.push({
        id,
        title:
          $el.find(".novel-title").first().text().trim() ||
          $(link).attr("title") ||
          id,
        subtitle:
          latestChapter || (chapterCount ? `${chapterCount} Chapters` : undefined),
        coverImage: src && !src.startsWith("data:") ? absoluteUrl(src) : undefined,
        webUrl: bookUrl(id),
        rating: ContentRating.EVERYONE,
      });
    });

  return {
    items,
    isLastPage: $('a[rel="next"]').length === 0,
  };
}

// ================================ Content =================================

export function parseContent(html: string, contentId: string): Content {
  const $ = load(html);
  const $novel = $("#novel");

  const stats = new Map<string, string>();
  $novel.find(".header-stats > span").each((_, el) => {
    const label = $(el).find("small").text().trim().toLowerCase();
    stats.set(label, $(el).find("strong").text().trim());
  });

  const genres: Tag[] = $novel
    .find(".categories a.property-item")
    .toArray()
    .map((a) => {
      const title = $(a).text().trim();
      const slug = $(a).attr("href")?.match(/\/genre-([^/]+)\//)?.[1];
      return { id: slug ?? title.toLowerCase(), title };
    });

  const credits: Credit[] = $novel
    .find(".author a")
    .toArray()
    .map((a) => ({ name: $(a).text().trim(), role: "Author" }))
    .filter((c) => c.name.length > 0);

  const summary = $novel
    .find(".summary .content > p")
    .toArray()
    .map((p) => $(p).text().trim())
    .filter((t) => t.length > 0)
    .join("\n\n");

  const rank = $novel.find(".rating .rank").text().replace(/rank/i, "").trim();
  const score = $novel.find(".rating .nub").first().text().trim();
  const details: Record<string, string> = {};
  if (rank) details["Rank"] = rank;
  if (score) details["Rating"] = `${score} / 5`;
  if (stats.get("chapters")) details["Chapters"] = stats.get("chapters")!;

  const related = parseListing(html, "section.related").items;

  return {
    title: $novel.find("h1.novel-title").first().text().trim(),
    coverImage: absoluteUrl($novel.find("figure.cover img").attr("src") ?? ""),
    webUrl: bookUrl(contentId),
    rating: parseContentRating(genres),
    status: parseStatus(stats.get("status")),
    contentType: ContentType.NOVEL,
    summary: summary || undefined,
    credits: nonEmpty(credits),
    genres: nonEmpty(genres),
    additionalDetails: Object.keys(details).length > 0 ? details : undefined,
    collections:
      related.length > 0
        ? [{ id: "related", title: "You May Also Like", items: related }]
        : undefined,
    statistics: {
      views: parseCompactNumber(stats.get("views")),
      bookmarks: parseCompactNumber(stats.get("bookmarked")),
    },
    links: [{ title: "Website", url: bookUrl(contentId) }],
  };
}

function parseContentRating(genres: Tag[]): ContentRating {
  const names = genres.map((g) => g.title.toLowerCase());
  if (names.some((n) => MATURE_GENRES.includes(n))) return ContentRating.MATURE;
  if (names.some((n) => SUGGESTIVE_GENRES.includes(n))) return ContentRating.SUGGESTIVE;
  return ContentRating.EVERYONE;
}

function parseStatus(status?: string): ContentStatus {
  switch (status?.toLowerCase()) {
    case "ongoing":
      return ContentStatus.ONGOING;
    case "completed":
      return ContentStatus.COMPLETED;
    default:
      return ContentStatus.UNKNOWN;
  }
}

// ================================ Chapters ================================

/** Returns the highest page number linked from a chapter list page's pagination. */
export function parseLastChapterPage(html: string): number {
  const $ = load(html);
  const pages = $(".pagination a.page-link")
    .toArray()
    .map((a) => Number($(a).attr("href")?.match(/[?&]page=(\d+)/)?.[1]))
    .filter((n) => !isNaN(n));
  return Math.max(1, ...pages);
}

/** Parses one chapter list page, in the site's order (oldest first). */
export function parseChapterPage(html: string, contentId: string): Chapter[] {
  const $ = load(html);
  return $("ul.chapter-list li a")
    .toArray()
    .flatMap((a) => {
      const $a = $(a);
      const id = $a.attr("href")?.match(/\/book\/[^/]+\/([^/?#]+)/)?.[1];
      if (!id) return [];

      const number = Number($a.find(".chapter-no").text().trim());
      return [
        {
          id,
          index: 0,
          number: isNaN(number) ? -1 : number,
          title: $a.find(".chapter-title").text().trim() || $a.attr("title") || undefined,
          language: "en",
          date: parseDateTime($a.find("time").attr("datetime")),
          webUrl: `${bookUrl(contentId)}/${id}`,
        },
      ];
    });
}

/** Parses "YYYY-MM-DD HH:mm[:ss]" as UTC. */
function parseDateTime(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value.trim().replace(" ", "T")}Z`);
  return isNaN(date.getTime()) ? undefined : date;
}

// ============================== Chapter Text ==============================

/** Returns the chapter body as HTML, or null if the page has no chapter text. */
export function parseChapterText(html: string): string | null {
  const $ = load(html);
  const $content = $("#content");
  // Missing chapters return 200 with a "not found" message in #content but no chapter title.
  if ($content.length === 0 || $(".chapter-title").length === 0) return null;

  $content.find("script, style, iframe, ins, noscript, .nf-ads").remove();

  const blocks = $content
    .children()
    .toArray()
    .filter((el) => TEXT_TAGS.has(el.tagName.toLowerCase()))
    .map((el) => {
      const $el = $(el);
      for (const name of Object.keys(el.attribs)) $el.removeAttr(name);
      return $.html($el);
    });

  if (blocks.length > 0) return blocks.join("\n");

  // Some chapters are bare text separated by <br>; wrap each line in a paragraph.
  const lines = ($content.html() ?? "")
    .split(/<br\s*\/?>/i)
    .map((line) => load(line).text().trim())
    .filter((line) => line.length > 0);
  return lines.length > 0
    ? lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n")
    : null;
}
