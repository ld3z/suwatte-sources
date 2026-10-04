import {
  Chapter,
  Content,
  ContentType,
  Item,
  SourceChapterResource,
  WebLink,
} from "@suwatte/toolchain";
import { load } from "cheerio/slim";
import type { AnyNode, Element } from "domhandler" with { "resolution-mode": "import" };

import {
  absoluteUrl,
  bookUrl,
  escapeHtml,
  nonEmpty,
  ratingForTags,
  seriesUrl,
  toTitleCase,
} from "./utils";

/** Suwatte's limit on resources per chapter text. */
const MAX_RESOURCES = 512;

const BLOCK_CONTAINERS = new Set(["div", "section", "article", "figure", "aside", "header", "footer", "table", "tbody", "tr", "td"]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const SKIPPED = new Set(["script", "style", "source", "noscript", "template"]);

// ============================== Home Page ===============================

/** Parses the home page's seasonal anime section, whose heading changes each season. */
export function parseSeasonal(html: string): { title: string; items: Item[] } | null {
  const $ = load(html);
  const heading = $("h2")
    .toArray()
    .find((h) => /anime/i.test($(h).text()));
  if (!heading) return null;

  const items = $(heading)
    .closest("section")
    .find('.catalog-grid a[href^="/series/"]')
    .toArray()
    .flatMap((a): Item[] => {
      const id = $(a).attr("href")?.match(/^\/series\/(\d+\/[^/?#]+)/)?.[1];
      if (!id) return [];
      const $img = $(a).find("img");
      return [
        {
          id,
          title: $(a).find("span, h3").first().text().trim() || $img.attr("alt") || id,
          coverImage: $img.attr("src"),
          webUrl: seriesUrl(id),
          rating: ratingForTags([]),
        },
      ];
    });

  return { title: toTitleCase($(heading).text().trim()), items };
}

// ================================ Series ================================

export function parseSeries(html: string, contentId: string): Content {
  const $ = load(html);
  const $hero = $(".hero-card");

  const tags = $hero
    .find(".tags-box.desktop a.tag")
    .toArray()
    .map((a) => $(a).text().trim())
    .filter((t) => t.length > 0);

  const links: WebLink[] = [{ title: "Website", url: seriesUrl(contentId) }];
  const endpoints: Record<string, string> = {};
  $(".s-external-links a.link-pill").each((_, a) => {
    const url = $(a).attr("href");
    if (!url) return;
    links.push({ title: $(a).attr("title") || $(a).text().trim(), url });

    const anilist = url.match(/anilist\.co\/manga\/(\d+)/)?.[1];
    const mal = url.match(/myanimelist\.net\/manga\/(\d+)/)?.[1];
    if (anilist) endpoints.anilist = anilist;
    if (mal) endpoints.mal = mal;
  });

  const author = $hero.find(".author").first().text().trim();
  const volumeCount = $(".vol-grid article.card").length;

  return {
    title: $hero.find("h1.s-title").text().trim(),
    coverImage: absoluteUrl($hero.find(".cover-wrap img").attr("src") ?? ""),
    webUrl: seriesUrl(contentId),
    contentType: ContentType.NOVEL,
    rating: ratingForTags(tags),
    summary: $hero.find(".desc-box .description").text().trim() || undefined,
    credits: author ? [{ name: author, role: "Author" }] : undefined,
    genres: nonEmpty(tags.map((t) => ({ id: t, title: toTitleCase(t) }))),
    additionalDetails: volumeCount > 0 ? { Volumes: String(volumeCount) } : undefined,
    endpoints: Object.keys(endpoints).length > 0 ? endpoints : undefined,
    links,
  };
}

/**
 * Each volume is one chapter, newest first. Volume numbers are read from the
 * card titles; series whose numbers restart (e.g. "Part 2 Volume 1") are
 * numbered by position instead, so progress always moves to the next volume.
 */
export function parseVolumes(html: string): Chapter[] {
  const $ = load(html);
  const seriesTitle = $("h1.s-title").first().text().trim();
  const cards = $(".vol-grid article.card")
    .toArray()
    .flatMap((el) => {
      const href = $(el).find("a.stretched-link").attr("href");
      const id = href?.match(/^\/book\/(\d+\/[^/?#]+)/)?.[1];
      if (!id) return [];

      // The site splits "Volume 4.5: Summer Stories" into the title and a ".5: ..." footer.
      const meta = $(el).find(".card-meta").text().trim();
      const base = stripSeriesTitle($(el).find(".card-title").text().trim(), seriesTitle);
      const title = meta.startsWith(".") ? `${base}${meta}` : base;
      return [{ id, title, number: parseVolumeNumber(title) }];
    });

  const numbers = cards.map((card) => card.number);
  const usable = numbers.every((n, i) => !isNaN(n) && (i === 0 || n > numbers[i - 1]));

  return cards
    .map((card, position): Chapter => {
      const number = usable ? card.number : position + 1;
      return {
        id: card.id,
        index: cards.length - 1 - position,
        number,
        volume: number,
        title: card.title || undefined,
        language: "en",
        webUrl: bookUrl(card.id),
      };
    })
    .reverse();
}

/** "Series Name Part 1: X Volume 2" → "Part 1: X Volume 2"; apostrophe styles may differ. */
function stripSeriesTitle(title: string, seriesTitle: string): string {
  const normalize = (s: string) => s.replace(/[’‘]/g, "'").toLowerCase();
  if (!seriesTitle || !normalize(title).startsWith(normalize(seriesTitle))) return title;
  const rest = title.slice(seriesTitle.length).replace(/^[\s:–—-]+/, "");
  return rest || title;
}

function parseVolumeNumber(title: string): number {
  const labelled = [...title.matchAll(/\b(?:volume|vol\.?)\s*(\d+(?:\.\d+)?)/gi)].pop()?.[1];
  return Number(labelled ?? title.match(/(\d+(?:\.\d+)?)/)?.[1]);
}

// ================================= Book =================================

export interface RenderedBook {
  body: string;
  resources: SourceChapterResource[];
}

/**
 * Converts a volume page to semantic HTML. The page is an EPUB rendered as
 * `section.chapter` blocks; inline styles become <em>/<strong>.
 */
export function renderBook(html: string, includeIllustrations: boolean): RenderedBook | null {
  const $ = load(html);
  const sections = $("section.chapter").toArray();
  if (sections.length === 0) return null;

  const toc = parseTableOfContents($("script#app-data").text());
  const resources = new Map<string, SourceChapterResource>();

  const renderImage = (img: Element): string => {
    const url = img.attribs.src;
    const file = url?.split("/").pop()?.split("?")[0];
    if (!includeIllustrations || !url || !file) return "";

    const href = `images/${file}`;
    if (!resources.has(href)) {
      if (resources.size >= MAX_RESOURCES) return "";
      resources.set(href, { href, url: absoluteUrl(url), mediaType: "image/jpeg" });
    }
    return `<img src="${href}" alt="${escapeHtml(img.attribs.alt ?? "")}">`;
  };

  const renderInline = (nodes: AnyNode[]): string =>
    nodes
      .map((node) => {
        if (node.type === "text") return escapeHtml((node as any).data ?? "");
        if (node.type !== "tag") return "";

        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        if (SKIPPED.has(tag)) return "";
        if (tag === "br") return "<br>";
        if (tag === "img") return renderImage(el);
        if (tag === "picture") {
          const img = el.children.find((c): c is Element => c.type === "tag" && (c as Element).tagName === "img");
          return img ? renderImage(img) : "";
        }

        const inner = renderInline(el.children);
        if (!inner) return "";
        if (tag === "sup" || tag === "sub") return `<${tag}>${inner}</${tag}>`;

        const style = (el.attribs.style ?? "").toLowerCase();
        const fontSize = parseFloat(style.match(/font-size:\s*([\d.]+)em/)?.[1] ?? "1");
        const isDropCap = fontSize >= 1.5;
        let out = inner;
        if (tag === "em" || tag === "i" || /font-style:\s*italic/.test(style)) out = `<em>${out}</em>`;
        if (!isDropCap && (tag === "strong" || tag === "b" || /font-weight:\s*(bold|[6-9]00)/.test(style))) {
          out = `<strong>${out}</strong>`;
        }
        return out;
      })
      .join("");

  const hasContent = (inner: string) =>
    inner.includes("<img") || inner.replace(/<[^>]+>/g, "").replace(/[\s\u00a0]/g, "").length > 0;

  const renderBlocks = (nodes: AnyNode[]): string[] =>
    nodes.flatMap((node): string[] => {
      if (node.type === "text") {
        const text = ((node as any).data ?? "").trim();
        return text ? [`<p>${escapeHtml(text)}</p>`] : [];
      }
      if (node.type !== "tag") return [];

      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (SKIPPED.has(tag)) return [];
      if (tag === "hr") return ["<hr>"];
      if (tag === "h2" && el.attribs.class?.includes("chapter-title")) return [];
      if (BLOCK_CONTAINERS.has(tag)) return renderBlocks(el.children);
      if (tag === "blockquote" || tag === "ul" || tag === "ol") {
        const inner = renderBlocks(el.children).join("");
        return inner ? [`<${tag}>${inner}</${tag}>`] : [];
      }

      const inner = renderInline(tag === "img" || tag === "picture" ? [el] : el.children).trim();
      if (!hasContent(inner)) return [];
      if (HEADINGS.has(tag)) return [`<h3>${inner}</h3>`];
      if (tag === "li") return [`<li>${inner}</li>`];
      return [`<p>${inner}</p>`];
    });

  // A chapter's TOC entry often points at an illustration-only section, so the
  // title is held until the next section that has text.
  let pendingTitle: string | undefined;
  const parts = sections.flatMap((section) => {
    pendingTitle = toc.get(section.attribs.id ?? "") ?? pendingTitle;
    const blocks = renderBlocks(section.children);
    if (blocks.length === 0 || !pendingTitle) return blocks;

    const title = pendingTitle;
    pendingTitle = undefined;
    const leading = blocks[0].match(/^<h3>(.*)<\/h3>$/)?.[1];
    if (leading !== undefined && normalizeTitle(leading) === normalizeTitle(title)) {
      blocks.shift();
    }
    return [`<h2>${escapeHtml(title)}</h2>`, ...blocks];
  });

  if (parts.length === 0) return null;
  return { body: parts.join("\n"), resources: [...resources.values()] };
}

/** Compares headings ignoring markup, punctuation, and case ("Chapter 1 | X" matches "Chapter 1 X"). */
function normalizeTitle(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&[a-z]+;|[^\p{L}\p{N}]/giu, "").toLowerCase();
}

/** Maps section ids (e.g. "page05") to chapter names from the page's JSON-LD. */
function parseTableOfContents(json: string): Map<string, string> {
  const toc = new Map<string, string>();
  try {
    const data = JSON.parse(json);
    for (const part of data?.hasPart ?? []) {
      const id = typeof part?.url === "string" ? part.url.replace(/^#/, "") : "";
      if (id && typeof part.name === "string") toc.set(id, part.name);
    }
  } catch {
    // Sections render without titles if the metadata is missing.
  }
  return toc;
}
