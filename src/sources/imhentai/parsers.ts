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
  languageTitle,
  normalizeCategoryId,
} from "./constants";
import { AdvNamespace, formatAdvToken } from "./search";
import { Preferences } from "./settings";
import {
  IMHentaiPageSpec,
  IMHentaiTagEntry,
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
  return `${BASE_URL}/view/${id}/${page}/`;
}

/** CDN server host derived from `load_server` or IMHentai's gallery ID range table. */
export function resolveImageServer(
  galleryId: number,
  loadServer?: string | null,
  coverUrl?: string | null
): string {
  const srv = loadServer?.trim();
  if (srv && /^\d+$/.test(srv)) {
    return `m${srv}.imhentai.xxx`;
  }
  const hostMatch = /^https?:\/\/([^/]+)\//i.exec(coverUrl ?? "");
  if (hostMatch) return hostMatch[1];

  if (galleryId > 0 && galleryId <= 274825) return "m1.imhentai.xxx";
  if (galleryId <= 403818) return "m2.imhentai.xxx";
  if (galleryId <= 527143) return "m3.imhentai.xxx";
  if (galleryId <= 632481) return "m4.imhentai.xxx";
  if (galleryId <= 816010) return "m5.imhentai.xxx";
  if (galleryId <= 970098) return "m6.imhentai.xxx";
  if (galleryId <= 1121113) return "m7.imhentai.xxx";
  if (galleryId <= 1259410) return "m8.imhentai.xxx";
  if (galleryId <= 1439024) return "m9.imhentai.xxx";
  if (galleryId <= 1663755) return "m10.imhentai.xxx";
  return "m11.imhentai.xxx";
}

/** Decodes IMHentai's occasionally double-encoded HTML entities (`&amp;#039;` -> `'`). */
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
  subtitle: string | undefined,
  display: TitleDisplay
): string {
  if (display === "subtitle" && subtitle?.trim()) {
    return subtitle.trim();
  }
  if (display === "clean") {
    return cleanShortTitle(fullTitle);
  }
  return fullTitle.trim() || subtitle?.trim() || "Untitled";
}

function readImgUrl($el: ReturnType<ReturnType<typeof load>>): string | undefined {
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
  const m = /\(([\d,]+)\)\s*results?\s*found/i.exec(text) ?? /([\d,]+)/.exec(text);
  if (!m) return undefined;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseCard($: ReturnType<typeof load>, el: any): ParsedListingCard | null {
  const $card = $(el);
  const linkEl = $card.find(".inner_thumb a[href*='/gallery/'], a[href*='/gallery/']").first();
  const href = linkEl.attr("href") ?? "";
  const idMatch = GALLERY_HREF_RE.exec(href);
  if (!idMatch) return null;

  const rawTitle =
    $card.find(".caption h2, .caption, .gallery_title").first().text() ||
    linkEl.attr("title") ||
    "";
  const title = decodeEntities(rawTitle);
  if (!title) return null;

  // Prefer `.inner_thumb img` only — a bare `img` match picks the language flag first.
  const imgEl = $card.find(".inner_thumb img").first();
  const coverImage = readImgUrl(imgEl);

  const category =
    $card.find(".thumb_cat, .gallery_cat").first().text().trim() || undefined;

  const langHref =
    $card
      .find("a[href*='/language/']")
      .first()
      .attr("href") ?? "";
  const language =
    /\/language\/([^/?#]+)/i.exec(langHref)?.[1]?.toLowerCase() || undefined;

  return {
    id: idMatch[1],
    title,
    coverImage,
    category,
    language,
  };
}

export function parseListingHtml(html: string): ParsedListingResult {
  if (html.includes("Overload... Please use the advanced search")) {
    throw new Error(
      "IMHentai basic search is temporarily overloaded; refine with tag filters or try again shortly."
    );
  }

  const $ = load(html);
  // Exclude sidebar `.ranking_list` cards so listings only return main results.
  $(".ranking_list").remove();

  const headingText = $(
    "h1, .galleries_title, .total_galleries"
  )
    .first()
    .text();
  const total = /\(([\d,]+)\)\s*results?\s*found/i.test(headingText)
    ? parseCountText(headingText)
    : undefined;

  const items: ParsedListingCard[] = [];
  const seen = new Set<string>();

  $("div.thumb").each((_, el) => {
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
  };
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
  if (
    variantLanguage !== ALL_LANGUAGES &&
    card.language &&
    card.language !== variantLanguage &&
    card.language !== "speechless"
  ) {
    return false;
  }
  return true;
}

export function cardToItem(
  card: ParsedListingCard,
  variantLanguage: string,
  prefs: Preferences
): Item {
  const cat = categoryTitle(card.category);
  const lang =
    variantLanguage === ALL_LANGUAGES ? languageTitle(card.language) : undefined;
  const subtitle = [cat, lang].filter(Boolean).join(" · ") || undefined;

  return {
    id: card.id,
    title: selectTitle(card.title, undefined, prefs.titleDisplay),
    subtitle,
    coverImage: card.coverImage,
    webUrl: galleryUrl(card.id),
    rating: ContentRating.MATURE,
  };
}

/** Parses `Posted: 2 hours ago` / `Posted: 3 days ago` / `Posted: 2 years ago` into a `Date`. */
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

/** Parses `var g_th = $.parseJSON('{"1":"w,1280,1818",...}')` from gallery or reader HTML. */
export function parseGThScript(html: string): IMHentaiPageSpec[] {
  const match = /g_th\s*=\s*\$\.parseJSON\('([^']+)'\)/.exec(html);
  if (!match) return [];
  try {
    const raw = JSON.parse(match[1]) as Record<string, string>;
    const entries: IMHentaiPageSpec[] = [];
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

function parseTagAnchors(
  $: ReturnType<typeof load>,
  $li: ReturnType<ReturnType<typeof load>>
): IMHentaiTagEntry[] {
  const out: IMHentaiTagEntry[] = [];
  $li.find("a.tag").each((_, a) => {
    const $a = $(a).clone();
    const badgeText = $a.find(".badge").text().trim();
    const count = badgeText ? parseCountText(badgeText) : undefined;
    $a.find(".badge, .rborder").remove();

    const splitText = $a
      .find(".split_tag")
      .text()
      .replace(/^\s*\|\s*/, "")
      .trim();
    $a.find(".split_tag").remove();

    const name = decodeEntities($a.text().replace(/\s+/g, " ").trim());
    if (!name) return;

    const href = $(a).attr("href") ?? "";
    const slug =
      href.replace(/\/+$/, "").split("/").pop()?.toLowerCase() ?? "";
    out.push({
      name,
      altName: splitText || undefined,
      slug,
      count,
    });
  });
  return out;
}

export function parseGalleryHtml(
  html: string,
  fallbackId?: string
): ParsedGalleryDetail {
  const $ = load(html);
  const $info = $(".gallery_first");
  if ($info.length === 0) {
    throw new Error("Gallery not found or unavailable on IMHentai.");
  }

  const id =
    $("input#gallery_id").first().attr("value")?.trim() ||
    fallbackId ||
    "";
  const title = decodeEntities($info.find("h1").first().text());
  if (!id || !title) {
    throw new Error("Could not parse gallery details from IMHentai.");
  }

  const rawSubtitle = decodeEntities($info.find(".subtitle").first().text());
  const subtitle = rawSubtitle && rawSubtitle !== title ? rawSubtitle : undefined;

  const coverImage =
    readImgUrl($info.find(".left_cover img").first()) ?? "";

  let category: string | undefined;
  let languages: IMHentaiTagEntry[] = [];
  let tags: IMHentaiTagEntry[] = [];
  let artists: IMHentaiTagEntry[] = [];
  let groups: IMHentaiTagEntry[] = [];
  let parodies: IMHentaiTagEntry[] = [];
  let characters: IMHentaiTagEntry[] = [];
  let pageCount = 0;
  let postedText: string | undefined;

  $info.find(".galleries_info li").each((_, li) => {
    const $li = $(li);
    if ($li.hasClass("pages")) {
      pageCount = parseCountText($li.text()) ?? pageCount;
      return;
    }
    if ($li.hasClass("posted")) {
      postedText = $li.text().trim();
      return;
    }

    const label = $li
      .find(".tags_text")
      .text()
      .replace(":", "")
      .trim()
      .toLowerCase();
    switch (label) {
      case "parodies":
      case "parody":
        parodies = parseTagAnchors($, $li);
        break;
      case "characters":
      case "character":
        characters = parseTagAnchors($, $li);
        break;
      case "tags":
      case "tag":
        tags = parseTagAnchors($, $li);
        break;
      case "artists":
      case "artist":
        artists = parseTagAnchors($, $li);
        break;
      case "groups":
      case "group":
        groups = parseTagAnchors($, $li);
        break;
      case "languages":
      case "language":
        languages = parseTagAnchors($, $li);
        break;
      case "category":
      case "categories": {
        const cats = parseTagAnchors($, $li);
        category = cats[0]?.slug || cats[0]?.name;
        break;
      }
    }
  });

  const loadPages = parseInt(
    $("input#load_pages").attr("value") ?? "",
    10
  );
  if (!pageCount && Number.isFinite(loadPages) && loadPages > 0) {
    pageCount = loadPages;
  }

  const likes = parseCountText($("#like_btn").text());
  const dislikes = parseCountText($("#dlike_btn").text());
  const favorites = parseCountText($("#add_fav_btn").text());

  const loadServer = $("input#load_server").attr("value");
  const loadDir = $("input#load_dir").attr("value")?.trim() ?? "";
  const loadId = $("input#load_id").attr("value")?.trim() ?? "";

  const firstThumbUrl = readImgUrl($(".gthumb img").first());
  let imageBaseUrl = "";
  if (firstThumbUrl) {
    imageBaseUrl = firstThumbUrl.slice(0, firstThumbUrl.lastIndexOf("/") + 1);
  } else if (loadDir && loadId) {
    const host = resolveImageServer(parseInt(id, 10), loadServer, coverImage);
    imageBaseUrl = `https://${host}/${loadDir}/${loadId}/`;
  } else if (coverImage.includes("/cover.")) {
    imageBaseUrl = coverImage.slice(0, coverImage.lastIndexOf("/") + 1);
  }

  let pages = parseGThScript(html);
  if (!pages.length && pageCount > 0) {
    const fallbackExt =
      /\.([a-z0-9]+)(?:[?#]|$)/i.exec(firstThumbUrl ?? "")?.[1] ?? "jpg";
    pages = Array.from({ length: pageCount }, (_, idx) => ({
      page: idx + 1,
      ext: fallbackExt,
    }));
  }
  if (!pageCount && pages.length > 0) {
    pageCount = pages.length;
  }

  const related: ParsedListingCard[] = [];
  const seenRelated = new Set<string>([id]);
  $(".related div.thumb, .related_section div.thumb").each((_, el) => {
    const card = parseCard($, el);
    if (!card || seenRelated.has(card.id)) return;
    seenRelated.add(card.id);
    related.push(card);
  });

  return {
    id,
    title,
    subtitle,
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
    imageBaseUrl,
    pages,
    related,
  };
}

function linkedTag(ns: AdvNamespace, entry: IMHentaiTagEntry, label = entry.name): Tag {
  const query = formatAdvToken({ ns, value: entry.name, negative: false });
  return {
    id: `${ns}:${entry.slug || entry.name}`,
    title: label,
    destination: ItemListDestination({ key: `${QUERY_LIST_PREFIX}${query}` }, label),
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
    (l) => l.name.toLowerCase() !== "translated"
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
    (l) => l.name.toLowerCase() !== "translated"
  )?.name;
  const lang =
    variantLanguage === ALL_LANGUAGES ? languageTitle(primaryLang) : undefined;
  const subtitle = [cat, lang].filter(Boolean).join(" · ") || undefined;

  return {
    id: detail.id,
    title: selectTitle(detail.title, detail.subtitle, prefs.titleDisplay),
    subtitle,
    coverImage: detail.coverImage || undefined,
    webUrl: galleryUrl(detail.id),
    statistics:
      detail.favorites !== undefined ? { favorites: detail.favorites } : undefined,
    rating: ContentRating.MATURE,
  };
}

export function toContent(
  detail: ParsedGalleryDetail,
  variantLanguage: string,
  prefs: Preferences
): Content {
  const primaryTitle = selectTitle(
    detail.title,
    detail.subtitle,
    prefs.titleDisplay
  );
  const cleanTitle = cleanShortTitle(detail.title);
  const additionalTitles = [cleanTitle, detail.title, detail.subtitle].filter(
    (t, idx, arr): t is string =>
      !!t && t !== primaryTitle && arr.indexOf(t) === idx
  );

  const credits: Credit[] = [
    ...detail.artists.map((a) => ({
      name: a.altName ? `${a.name} (${a.altName})` : a.name,
      role: "Artist",
      destination: linkedTag("artist", a).destination,
    })),
    ...detail.groups.map((g) => ({
      name: g.altName ? `${g.name} (${g.altName})` : g.name,
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
    return {
      id: `language:${l.slug || l.name}`,
      title: label,
      destination:
        l.name.toLowerCase() === "translated"
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
    (l) => l.name.toLowerCase() !== "translated"
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
