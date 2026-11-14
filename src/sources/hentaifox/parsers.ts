import {
  Chapter,
  ChapterPage,
  Content,
  ContentRating,
  ContentStatus,
  ContentType,
  Credit,
  Item,
  ItemListDestination,
  ReadingMode,
  Tag,
  TagSection,
} from "@suwatte/toolchain";
import { load } from "cheerio/slim";

import {
  ALL_LANGUAGES,
  BASE_URL,
  QUERY_LIST_PREFIX,
  TitleDisplay,
  categoryTitle,
  languageCode,
  languageDataId,
  languageTitle,
  normalizeCategoryId,
} from "./constants";
import { Preferences } from "./settings";
import { formatSearchToken, slugifyTaxonomy } from "./search";
import {
  HentaiFoxPageSpec,
  HentaiFoxTagEntry,
  ParsedGalleryDetail,
  ParsedListingCard,
  ParsedListingResult,
} from "./types";

const GALLERY_HREF_RE = /\/gallery\/(\d+)/i;

const EXT_MAP: Record<string, string> = {
  j: "jpg",
  p: "png",
  w: "webp",
  g: "gif",
  b: "bmp",
  a: "avif",
};

export function galleryUrl(id: string | number): string {
  return `${BASE_URL}/gallery/${id}/`;
}

export function readerUrl(id: string | number, page = 1): string {
  return `${BASE_URL}/g/${id}/${page}/`;
}

export function decodeEntities(raw: string): string {
  let text = raw;
  for (let i = 0; i < 2; i++) {
    if (!text.includes("&")) break;
    const decoded = load(text, null, false).text();
    if (decoded === text) break;
    text = decoded;
  }
  return text.trim();
}

/** Strips `[Circle (Artist)]`, `(Event)`, and `[English]` bracket annotations. */
export function cleanShortTitle(raw: string): string {
  const stripped = raw
    .replace(/\[[^\]]*]|\([^)]*\)|\{[^}]*}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || raw.trim();
}

export function selectTitle(
  fullTitle: string,
  display: TitleDisplay
): string {
  if (display === "clean") return cleanShortTitle(fullTitle);
  return fullTitle.trim() || "Untitled";
}

function readImgUrl(
  $el: ReturnType<ReturnType<typeof load>>
): string | undefined {
  for (const attr of ["data-cfsrc", "data-src", "data-lazy-src", "src"]) {
    const val = $el.attr(attr)?.trim();
    if (!val || val.startsWith("data:")) continue;
    if (val.startsWith("//")) return `https:${val}`;
    if (val.startsWith("/")) return `${BASE_URL}${val}`;
    if (/^https?:\/\//i.test(val)) return val;
  }
  return undefined;
}

function parseCountText(text: string): number | undefined {
  const m =
    /\(([\d,]+)\)\s*results?\s*found/i.exec(text) ??
    /([\d,]+)\s+results?/i.exec(text) ??
    /\(([\d,]+)\)/.exec(text) ??
    /([\d,]+)/.exec(text);
  if (!m) return undefined;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseCard(
  $: ReturnType<typeof load>,
  el: any
): ParsedListingCard | null {
  const $card = $(el);
  const linkEl = $card
    .find(".inner_thumb a[href*='/gallery/'], a[href*='/gallery/']")
    .first();
  const href = linkEl.attr("href") ?? "";
  const idMatch = GALLERY_HREF_RE.exec(href);
  if (!idMatch) return null;

  const rawTitle =
    $card.find(".caption h2, .g_title, .caption").first().text() ||
    linkEl.attr("title") ||
    "";
  const title = decodeEntities(rawTitle);
  if (!title) return null;

  const imgEl = $card.find(".inner_thumb img, .image img").first();
  const coverImage = readImgUrl(imgEl);

  const category =
    $card.find(".g_cat, .t_cat, .thumb_cat").first().text().trim() ||
    undefined;

  const languageIds = ($card.attr("data-languages") ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    id: idMatch[1],
    title,
    coverImage,
    category,
    languageIds: languageIds.length ? languageIds : undefined,
  };
}

function extractCsrf(html: string): string | undefined {
  const m =
    /name=["']csrf-token["']\s+content=["']([^"']+)["']/i.exec(html) ??
    /content=["']([^"']+)["']\s+name=["']csrf-token["']/i.exec(html);
  return m?.[1]?.trim() || undefined;
}

export function parseListingHtml(html: string): ParsedListingResult {
  const $ = load(html);
  // Keep main catalogue cards only — drop parody overview / related / sidebar.
  $(".popular_galleries_overview, .related_galleries, .related, #middle_sidebar, .ranking_list").remove();

  const headingText = $("h1.tag_info, h1, .tag_info").first().text();
  const total = /([\d,]+)\s+results?/i.test(headingText)
    ? parseCountText(headingText)
    : undefined;

  const items: ParsedListingCard[] = [];
  const seen = new Set<string>();

  const $cards = $("div.lc_galleries > div.thumb, div.lc_galleries div.thumb");
  const $source = $cards.length > 0 ? $cards : $("div.thumb");
  $source.each((_, el) => {
    const card = parseCard($, el);
    if (!card || seen.has(card.id)) return;
    seen.add(card.id);
    items.push(card);
  });

  const hasNextPage =
    $(".pagination li.active + li:not(.disabled) a.page-link").length > 0 ||
    $(".pagination li:not(.disabled) a.page-link").filter((_, a) =>
      /next/i.test($(a).text())
    ).length > 0;

  let estimatedTotal = total;
  if (estimatedTotal === undefined) {
    let maxPage = 0;
    $(".pagination a.page-link").each((_, a) => {
      const n = parseInt($(a).text().trim(), 10);
      if (Number.isFinite(n) && n > maxPage) maxPage = n;
    });
    if (maxPage > 1) {
      estimatedTotal = maxPage * 20;
    } else if (!hasNextPage) {
      estimatedTotal = items.length;
    }
  }

  return {
    items,
    total: estimatedTotal,
    hasNextPage,
    csrfToken: extractCsrf(html),
  };
}

/** Parses the HTML fragment returned by `/includes/sidebar.php`. */
export function parseSidebarHtml(html: string): ParsedListingResult {
  const $ = load(html);
  const items: ParsedListingCard[] = [];
  const seen = new Set<string>();

  $("div.item").each((_, el) => {
    const $item = $(el);
    const link = $item.find("a[href*='/gallery/']").first();
    const href = link.attr("href") ?? "";
    const idMatch = GALLERY_HREF_RE.exec(href);
    if (!idMatch) return;
    const img = $item.find("img").first();
    const title = decodeEntities(
      img.attr("alt") ?? link.attr("title") ?? link.text()
    );
    if (!title) return;
    if (seen.has(idMatch[1])) return;
    seen.add(idMatch[1]);
    items.push({
      id: idMatch[1],
      title,
      coverImage: readImgUrl(img),
    });
  });

  return { items, total: items.length, hasNextPage: false };
}

export function isCardVisible(
  card: ParsedListingCard,
  variantLanguage: string,
  prefs: Preferences
): boolean {
  if (prefs.excludedCategories.length > 0 && card.category) {
    const catId = normalizeCategoryId(card.category);
    if (catId && prefs.excludedCategories.includes(catId)) return false;
  }
  if (variantLanguage !== ALL_LANGUAGES) {
    const wantId = languageDataId(variantLanguage);
    if (wantId && card.languageIds?.length) {
      if (!card.languageIds.includes(wantId)) return false;
    }
  }
  return true;
}

export function cardToItem(
  card: ParsedListingCard,
  variantLanguage: string,
  prefs: Preferences
): Item {
  const cat = categoryTitle(card.category);
  const subtitle = cat || undefined;
  void variantLanguage;

  return {
    id: card.id,
    title: selectTitle(card.title, prefs.titleDisplay),
    subtitle,
    coverImage: card.coverImage,
    webUrl: galleryUrl(card.id),
    rating: ContentRating.MATURE,
  };
}

/** Parses `Posted: 2 hours ago` / `Posted: 3 days ago` into a `Date`. */
export function parseRelativePostedDate(text?: string | null): Date | undefined {
  if (!text) return undefined;
  const clean = text.replace(/^posted:\s*/i, "").trim().toLowerCase();
  if (!clean) return undefined;

  const now = Date.now();
  if (clean.startsWith("just now") || clean.startsWith("today")) {
    return new Date(now);
  }
  if (clean.startsWith("yesterday")) {
    return new Date(now - 24 * 60 * 60 * 1000);
  }

  const m = /(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/i.exec(
    clean
  );
  if (!m) return undefined;
  const amount = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const unitMs: Record<string, number> = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };
  return unitMs[unit] ? new Date(now - amount * unitMs[unit]) : undefined;
}

/** Parses `var g_th = $.parseJSON('{"1":"w,1280,1818",...}')`. */
export function parseGThScript(html: string): HentaiFoxPageSpec[] {
  const match = /g_th\s*=\s*\$\.parseJSON\('([^']+)'\)/.exec(html);
  if (!match) return [];
  try {
    const raw = JSON.parse(match[1]) as Record<string, string>;
    const entries: HentaiFoxPageSpec[] = [];
    for (const [key, val] of Object.entries(raw)) {
      const pageNum = parseInt(key, 10);
      if (!Number.isFinite(pageNum) || pageNum < 1) continue;
      const [code, wStr, hStr] = String(val).split(",");
      const ext = EXT_MAP[code?.trim() ?? ""] ?? "jpg";
      const width = parseInt(wStr ?? "", 10);
      const height = parseInt(hStr ?? "", 10);
      entries.push({
        page: pageNum,
        ext,
        width: Number.isFinite(width) ? width : undefined,
        height: Number.isFinite(height) ? height : undefined,
      });
    }
    return entries.sort((a, b) => a.page - b.page);
  } catch {
    return [];
  }
}

function parseTagList(
  $: ReturnType<typeof load>,
  $ul: ReturnType<ReturnType<typeof load>>
): HentaiFoxTagEntry[] {
  const out: HentaiFoxTagEntry[] = [];
  $ul.find("a.tag_btn, a.tag").each((_, a) => {
    const $a = $(a).clone();
    const badgeText = $a.find(".t_badge, .badge").text().trim();
    const count = badgeText ? parseCountText(badgeText) : undefined;
    $a.find(".t_badge, .badge").remove();
    const name = decodeEntities($a.text().replace(/\s+/g, " ").trim());
    if (!name) return;
    const href = $(a).attr("href") ?? "";
    const slug =
      href.replace(/\/+$/, "").split("/").pop()?.toLowerCase() ??
      slugifyTaxonomy(name);
    out.push({ name, slug, count });
  });
  return out;
}

export function parseGalleryHtml(
  html: string,
  fallbackId?: string
): ParsedGalleryDetail {
  const $ = load(html);
  const $info = $(".gallery_right .info, .display_gallery .info").first();
  if ($info.length === 0) {
    throw new Error("Gallery not found or unavailable on HentaiFox.");
  }

  const id =
    $("input#gallery_id").first().attr("value")?.trim() ||
    fallbackId ||
    "";
  const title = decodeEntities($info.find("h1").first().text());
  if (!id || !title) {
    throw new Error("Could not parse gallery details from HentaiFox.");
  }

  const coverImage =
    readImgUrl($(".gallery_left .cover img, .cover img").first()) ?? "";

  const parodies = parseTagList($, $info.find("ul.parodies").first());
  const characters = parseTagList($, $info.find("ul.characters").first());
  const tags = parseTagList($, $info.find("ul.tags").first());
  const artists = parseTagList($, $info.find("ul.artists").first());
  const groups = parseTagList($, $info.find("ul.groups").first());
  const languages = parseTagList($, $info.find("ul.languages").first());
  const categories = parseTagList($, $info.find("ul.categories").first());
  const category = categories[0]?.slug || categories[0]?.name;

  let pageCount = 0;
  let postedText: string | undefined;
  $info.find("span.i_text.pages, span.pages").each((_, el) => {
    const text = $(el).text().trim();
    if (/^pages:/i.test(text)) {
      pageCount = parseCountText(text) ?? pageCount;
    } else if (/^posted:/i.test(text)) {
      postedText = text;
    }
  });

  const loadPages = parseInt(
    $("input#load_pages").attr("value") ?? "",
    10
  );
  if (!pageCount && Number.isFinite(loadPages) && loadPages > 0) {
    pageCount = loadPages;
  }

  const likes = parseCountText($("#thumbs_up").text());
  const dislikes = parseCountText($("#thumbs_down").text());
  const favorites = parseCountText($("#add_fav_btn").text());
  const downloads = parseCountText($("#dl_new").text());

  const loadDir = $("input#load_dir").attr("value")?.trim() ?? "";
  const loadId = $("input#load_id").attr("value")?.trim() ?? "";

  const firstThumbUrl = readImgUrl($(".g_thumb img, .gallery_thumb img").first());
  let imageBaseUrl = "";
  if (firstThumbUrl) {
    // Thumbnails are `Nt.ext` — strip filename to get the gallery folder.
    imageBaseUrl = firstThumbUrl.slice(0, firstThumbUrl.lastIndexOf("/") + 1);
  } else if (coverImage) {
    imageBaseUrl = coverImage.slice(0, coverImage.lastIndexOf("/") + 1);
  } else if (loadDir && loadId) {
    imageBaseUrl = `https://i.hentaifox.com/${loadDir}/${loadId}/`;
  }

  // Prefer CDN host from cover when thumbs used a different shard.
  if (coverImage && imageBaseUrl) {
    const coverHost = /^https?:\/\/([^/]+)\//i.exec(coverImage)?.[1];
    const baseHost = /^https?:\/\/([^/]+)\//i.exec(imageBaseUrl)?.[1];
    if (coverHost && baseHost && coverHost !== baseHost) {
      imageBaseUrl = imageBaseUrl.replace(baseHost, coverHost);
    }
  }

  let pages = parseGThScript(html);
  if (!pages.length && pageCount > 0) {
    const fallbackExt =
      /\.([a-z0-9]+)(?:[?#]|$)/i.exec(firstThumbUrl ?? coverImage ?? "")?.[1] ??
      "jpg";
    pages = Array.from({ length: pageCount }, (_, idx) => ({
      page: idx + 1,
      ext: fallbackExt === "jpg" || fallbackExt.length > 4 ? "jpg" : fallbackExt,
    }));
  }
  if (!pageCount && pages.length > 0) {
    pageCount = pages.length;
  }

  const related: ParsedListingCard[] = [];
  const seenRelated = new Set<string>([id]);
  $(".related_galleries div.thumb, .rel_div div.thumb").each((_, el) => {
    const card = parseCard($, el);
    if (!card || seenRelated.has(card.id)) return;
    seenRelated.add(card.id);
    related.push(card);
  });

  return {
    id,
    title,
    coverImage,
    category,
    languages,
    tags,
    artists,
    groups,
    parodies,
    characters,
    pageCount,
    postedText,
    likes,
    dislikes,
    favorites,
    downloads,
    imageBaseUrl,
    pages,
    related,
  };
}

function linkedTag(
  ns: "tag" | "parody" | "artist" | "character" | "group",
  entry: HentaiFoxTagEntry,
  label = entry.name
): Tag {
  const query = formatSearchToken(entry.name, false, true);
  return {
    id: `${ns}:${entry.slug || entry.name}`,
    title: label,
    destination: ItemListDestination(
      { key: `${QUERY_LIST_PREFIX}${ns === "tag" ? query : `${ns}:${entry.name}`}` },
      label
    ),
  };
}

function isWebtoonGallery(detail: ParsedGalleryDetail): boolean {
  const tagSet = new Set(detail.tags.map((t) => t.name.toLowerCase()));
  if (tagSet.has("webtoon") || tagSet.has("long strip")) return true;
  if (detail.pages.length >= 2) {
    const withDims = detail.pages.filter(
      (p) => p.width && p.height && p.width > 0
    );
    if (withDims.length >= 2) {
      const tall = withDims.filter((p) => p.height! / p.width! >= 3).length;
      if (tall / withDims.length >= 0.5) return true;
    }
  }
  return false;
}

function readingModeFor(detail: ParsedGalleryDetail): ReadingMode {
  if (isWebtoonGallery(detail)) return ReadingMode.VERTICAL;
  const catId = normalizeCategoryId(detail.category);
  if (catId === "doujinshi" || catId === "manga") {
    return ReadingMode.PAGED_MANGA;
  }
  return ReadingMode.PAGED_COMIC;
}

export function toChapter(detail: ParsedGalleryDetail): Chapter {
  const pages = detail.pageCount;
  const primaryLang = detail.languages.find(
    (l) =>
      l.name.toLowerCase() !== "translated" &&
      l.name.toLowerCase() !== "rewrite"
  )?.name;

  return {
    id: detail.id,
    index: 0,
    number: 1,
    title: `${pages} ${pages === 1 ? "Page" : "Pages"}`,
    language: languageCode(primaryLang),
    date: parseRelativePostedDate(detail.postedText),
    webUrl: readerUrl(detail.id, 1),
  };
}

export function detailToItem(
  detail: ParsedGalleryDetail,
  variantLanguage: string,
  prefs: Preferences
): Item {
  const cat = categoryTitle(detail.category);
  const primaryLang = detail.languages.find(
    (l) =>
      l.name.toLowerCase() !== "translated" &&
      l.name.toLowerCase() !== "rewrite"
  )?.name;
  const lang =
    variantLanguage === ALL_LANGUAGES
      ? languageTitle(primaryLang)
      : undefined;
  const subtitle = [cat, lang].filter(Boolean).join(" · ") || undefined;

  return {
    id: detail.id,
    title: selectTitle(detail.title, prefs.titleDisplay),
    subtitle,
    coverImage: detail.coverImage || undefined,
    webUrl: galleryUrl(detail.id),
    statistics:
      detail.favorites !== undefined
        ? { favorites: detail.favorites }
        : undefined,
    rating: ContentRating.MATURE,
  };
}

export function toContent(
  detail: ParsedGalleryDetail,
  variantLanguage: string,
  prefs: Preferences
): Content {
  const primaryTitle = selectTitle(detail.title, prefs.titleDisplay);
  const cleanTitle = cleanShortTitle(detail.title);
  const additionalTitles = [cleanTitle, detail.title].filter(
    (t, idx, arr): t is string =>
      !!t && t !== primaryTitle && arr.indexOf(t) === idx
  );

  const credits: Credit[] = [
    ...detail.artists.map((a) => ({
      name: a.name,
      role: "Artist",
      destination: linkedTag("artist", a).destination,
    })),
    ...detail.groups.map((g) => ({
      name: g.name,
      role: "Circle",
      destination: linkedTag("group", g).destination,
    })),
  ];

  const genres = detail.tags.map((t) => linkedTag("tag", t));

  const categoryTags: Tag[] = detail.category
    ? [
        {
          id: `category:${normalizeCategoryId(detail.category) ?? detail.category}`,
          title: categoryTitle(detail.category) ?? detail.category,
          destination: ItemListDestination(
            {
              key: `${QUERY_LIST_PREFIX}category:${normalizeCategoryId(detail.category) ?? detail.category}`,
            },
            categoryTitle(detail.category) ?? detail.category
          ),
        },
      ]
    : [];

  const languageTags: Tag[] = detail.languages.map((l) => {
    const label = languageTitle(l.name) ?? l.name;
    const lower = l.name.toLowerCase();
    return {
      id: `language:${l.slug || l.name}`,
      title: label,
      destination:
        lower === "translated" || lower === "rewrite"
          ? undefined
          : ItemListDestination(
              { key: `${QUERY_LIST_PREFIX}language:${l.slug || l.name}` },
              label
            ),
    };
  });

  const properties: TagSection[] = [
    {
      id: "parodies",
      title: "Parodies",
      tags: detail.parodies.map((p) => linkedTag("parody", p)),
    },
    {
      id: "characters",
      title: "Characters",
      tags: detail.characters.map((c) => linkedTag("character", c)),
    },
    {
      id: "artists",
      title: "Artists",
      tags: detail.artists.map((a) => linkedTag("artist", a)),
    },
    {
      id: "groups",
      title: "Groups",
      tags: detail.groups.map((g) => linkedTag("group", g)),
    },
    {
      id: "categories",
      title: "Category",
      tags: categoryTags,
    },
    {
      id: "languages",
      title: "Languages",
      tags: languageTags,
    },
  ].filter((s) => s.tags.length > 0);

  const details: Record<string, string> = {};
  if (detail.category) {
    details["Category"] = categoryTitle(detail.category) ?? detail.category;
  }
  const primaryLang = detail.languages.find(
    (l) =>
      l.name.toLowerCase() !== "translated" &&
      l.name.toLowerCase() !== "rewrite"
  )?.name;
  if (primaryLang) {
    details["Language"] = languageTitle(primaryLang) ?? primaryLang;
  }
  details["Pages"] = String(detail.pageCount);
  if (detail.postedText) {
    details["Posted"] = detail.postedText.replace(/^posted:\s*/i, "").trim();
  }
  details["Gallery ID"] = `#${detail.id}`;

  const totalVotes = (detail.likes ?? 0) + (detail.dislikes ?? 0);
  const ratingScore =
    totalVotes > 0
      ? Math.round(((detail.likes ?? 0) / totalVotes) * 50) / 10
      : undefined;

  const relatedItems = detail.related
    .filter((c) => isCardVisible(c, variantLanguage, prefs))
    .map((c) => cardToItem(c, variantLanguage, prefs));

  return {
    title: primaryTitle,
    additionalTitles: additionalTitles.length ? additionalTitles : undefined,
    coverImage: detail.coverImage,
    webUrl: galleryUrl(detail.id),
    rating: ContentRating.MATURE,
    status: ContentStatus.COMPLETED,
    contentType:
      normalizeCategoryId(detail.category) === "western"
        ? ContentType.COMIC
        : ContentType.MANGA,
    readingMode: readingModeFor(detail),
    statistics:
      ratingScore !== undefined || detail.favorites !== undefined
        ? { rating: ratingScore, favorites: detail.favorites }
        : undefined,
    credits: credits.length ? credits : undefined,
    genres: genres.length ? genres : undefined,
    properties: properties.length ? properties : undefined,
    additionalDetails: details,
    collections: relatedItems.length
      ? [{ id: "related", title: "Related Galleries", items: relatedItems }]
      : undefined,
    chapters: [toChapter(detail)],
  };
}

export function toChapterPages(detail: ParsedGalleryDetail): ChapterPage[] {
  if (!detail.imageBaseUrl || detail.pages.length === 0) return [];
  return detail.pages.map((spec) => ({
    url: `${detail.imageBaseUrl}${spec.page}.${spec.ext}`,
  }));
}
