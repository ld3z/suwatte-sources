import {
  Chapter,
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
  EH_BASE_URL,
  QUERY_LIST_PREFIX,
  TitleDisplay,
  categoryTitle,
  languageCode,
  languageTitle,
  normalizeCategoryId,
} from "./constants";
import { EHNamespace, formatSearchTerm } from "./search";
import { Preferences } from "./settings";
import {
  EHentaiGMetadata,
  ParsedGalleryPage,
  ParsedListingItem,
  ParsedListingPage,
  ResolvedReaderImage,
} from "./types";

const GALLERY_URL_RE = /\/g\/(\d+)\/([0-9a-f]{10})/i;
const VIEWER_URL_RE = /\/s\/([0-9a-f]{10})\/(\d+)-(\d+)/i;
const BG_URL_RE = /url\((['"]?)(https?:\/\/[^)'"]+)\1\)/i;

export function parseContentId(contentId: string): { gid: string; token: string } {
  const m = /^(\d+)\/([0-9a-f]{10})/i.exec(contentId.trim());
  if (!m) {
    throw new Error(`Invalid E-Hentai gallery ID '${contentId}'.`);
  }
  return { gid: m[1], token: m[2].toLowerCase() };
}

export function galleryWebUrl(
  contentId: string,
  baseUrl = EH_BASE_URL
): string {
  const { gid, token } = parseContentId(contentId);
  return `${baseUrl}/g/${gid}/${token}/`;
}

/** Strips `[Circle (Artist)]`, `(Event)`, and `[English]` bracket annotations. */
export function cleanShortTitle(raw: string): string {
  const stripped = raw
    .replace(/^(?:\s*(?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\}))+\s*/, "")
    .replace(/\s*(?:\s*(?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\}))+$/, "")
    .trim();
  return stripped || raw.trim();
}

export function selectTitle(
  englishTitle: string,
  japaneseTitle: string | undefined,
  display: TitleDisplay
): string {
  if (display === "japanese" && japaneseTitle?.trim()) {
    return japaneseTitle.trim();
  }
  if (display === "clean") {
    return cleanShortTitle(englishTitle);
  }
  return englishTitle.trim() || japaneseTitle?.trim() || "Untitled";
}

/** Parses `2026-11-10 16:07` (UTC on E-Hentai) into a `Date`. */
export function parseEHDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const d = new Date(`${m[1]}T${m[2]}:00Z`);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Converts E-Hentai's star sprite `background-position: Xpx Ypx` into `0..5`. */
export function parseStarSprite(style?: string | null): number | undefined {
  if (!style) return undefined;
  const m = /background-position\s*:\s*(-?\d+)px\s+(-?\d+)px/i.exec(style);
  if (!m) return undefined;
  const x = parseInt(m[1], 10);
  const y = parseInt(m[2], 10);
  const stars = 5 + x / 16 - (y <= -15 ? 0.5 : 0);
  return stars >= 0 && stars <= 5 ? Math.round(stars * 10) / 10 : undefined;
}

function parseCountNumber(text: string): number | undefined {
  const m = /([\d,]+)/.exec(text);
  if (!m) return undefined;
  const num = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Parses any E-Hentai listing HTML (Extended, Compact, Minimal, Thumbnail,
 * Popular, Toplist, Watched, or Favorites).
 */
export function parseListingPage(html: string): ParsedListingPage {
  const $ = load(html);

  const countText = $("div.searchtext, p.ip").first().text();
  const total = /no\s+hits\s+found|no\s+unfiltered\s+results/i.test(countText)
    ? 0
    : parseCountNumber(countText);

  const items: ParsedListingItem[] = [];
  const seen = new Set<string>();

  const containers = $(
    "table.itg tr, div.itg > div.gl1t"
  ).toArray();

  for (const el of containers) {
    const $el = $(el);
    const linkEl = $el.find("a[href*='/g/']").first();
    const href = linkEl.attr("href");
    if (!href) continue;

    const idMatch = GALLERY_URL_RE.exec(href);
    if (!idMatch) continue;
    const gid = parseInt(idMatch[1], 10);
    const token = idMatch[2].toLowerCase();
    const id = `${gid}/${token}`;
    if (seen.has(id)) continue;

    const title =
      $el.find(".glink").first().text().trim() ||
      linkEl.text().trim();
    if (!title) continue;
    seen.add(id);

    const imgEl = $el
      .find(".gl1e img, .glthumb img, .gl3t img, img[data-src], img[src*='ehgt'], img[src*='exhentai'], img[src*='hath.network']")
      .first();
    const dataSrc = imgEl.attr("data-src");
    const rawSrc = imgEl.attr("src");
    const coverImage =
      dataSrc && /^https?:\/\//i.test(dataSrc)
        ? dataSrc
        : rawSrc && /^https?:\/\//i.test(rawSrc)
          ? rawSrc
          : undefined;

    const category = $el.find(".cn, .cs").first().text().trim() || undefined;
    const rating = parseStarSprite($el.find("div.ir").first().attr("style"));

    let pages: number | undefined;
    $el.find("div, td").each((_, node) => {
      if (pages !== undefined) return;
      const t = $(node).text().trim();
      const pm = /^(\d+)\s+pages?$/i.exec(t);
      if (pm) pages = parseInt(pm[1], 10);
    });

    const tags = $el
      .find("div.gt, div.gtl, div.gtw")
      .map((_, tagEl) => ($(tagEl).attr("title") ?? $(tagEl).text()).trim().toLowerCase())
      .get()
      .filter(Boolean);

    items.push({
      id,
      gid,
      token,
      title,
      coverImage,
      category,
      rating,
      pages,
      tags,
    });
  }

  // Cursor-based pagination (`#unext` / `#dnext`) or numbered pagination (`table.ptt`).
  const nextHref = $("#unext").attr("href") ?? $("#dnext").attr("href");
  const nextCursor = nextHref
    ? /[?&]next=([^&#]+)/i.exec(nextHref)?.[1]
    : undefined;

  // On `toplist.php`, pagination uses `table.ptt` where the last `td` has `ptdd` when disabled.
  const pttLastCell = $("table.ptt").first().find("td").last();
  const hasNumberedNext =
    pttLastCell.length > 0 &&
    !pttLastCell.hasClass("ptdd") &&
    pttLastCell.find("a").length > 0;

  return {
    items,
    total,
    nextCursor,
    hasNextPage: Boolean(nextCursor || hasNumberedNext),
  };
}

export function isListingItemVisible(
  item: ParsedListingItem,
  prefs: Preferences
): boolean {
  if (prefs.excludedCategories.length > 0 && item.category) {
    const catId = normalizeCategoryId(item.category);
    if (catId && prefs.excludedCategories.includes(catId)) return false;
  }
  if (prefs.hiddenTags.length > 0 && item.tags.length > 0) {
    const tagSet = new Set<string>();
    for (const t of item.tags) {
      tagSet.add(t);
      const colon = t.indexOf(":");
      if (colon > 0) tagSet.add(t.slice(colon + 1));
    }
    if (prefs.hiddenTags.some((h) => tagSet.has(h))) return false;
  }
  return true;
}

function itemLanguageTitle(tags: string[]): string | undefined {
  for (const tag of tags) {
    if (!tag.startsWith("language:")) continue;
    const lang = languageTitle(tag.slice("language:".length));
    if (lang) return lang;
  }
  return undefined;
}

export function listingItemToSuwatteItem(
  item: ParsedListingItem,
  variantLanguage: string,
  prefs: Preferences,
  baseUrl = EH_BASE_URL
): Item {
  const cat = categoryTitle(item.category);
  const lang =
    variantLanguage === ALL_LANGUAGES ? itemLanguageTitle(item.tags) : undefined;
  const subtitle = [cat, lang].filter(Boolean).join(" · ") || undefined;

  return {
    id: item.id,
    title: selectTitle(item.title, undefined, prefs.titleDisplay),
    subtitle,
    coverImage: item.coverImage,
    webUrl: galleryWebUrl(item.id, baseUrl),
    statistics: item.rating !== undefined ? { rating: item.rating } : undefined,
    rating:
      normalizeCategoryId(item.category) === "non-h"
        ? ContentRating.SUGGESTIVE
        : ContentRating.MATURE,
  };
}

export function gmetadataToItem(
  meta: EHentaiGMetadata,
  variantLanguage: string,
  prefs: Preferences,
  baseUrl = EH_BASE_URL
): Item {
  const id = `${meta.gid}/${meta.token}`;
  const cat = categoryTitle(meta.category);
  const lang =
    variantLanguage === ALL_LANGUAGES
      ? itemLanguageTitle(meta.tags ?? [])
      : undefined;
  const subtitle = [cat, lang].filter(Boolean).join(" · ") || undefined;
  const ratingNum = parseFloat(meta.rating);

  return {
    id,
    title: selectTitle(meta.title, meta.title_jpn, prefs.titleDisplay),
    subtitle,
    coverImage: meta.thumb || undefined,
    webUrl: galleryWebUrl(id, baseUrl),
    statistics: Number.isFinite(ratingNum) ? { rating: ratingNum } : undefined,
    rating:
      normalizeCategoryId(meta.category) === "non-h"
        ? ContentRating.SUGGESTIVE
        : ContentRating.MATURE,
  };
}

/** Extracts `/s/{ptoken}/{gid}-{pageNum}` viewer links from a gallery HTML page. */
export function parseViewerLinks(html: string): Map<number, string> {
  const $ = load(html);
  const map = new Map<number, string>();
  $("#gdt a[href*='/s/']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const m = VIEWER_URL_RE.exec(href);
    if (!m) return;
    const pageNum = parseInt(m[3], 10);
    if (Number.isFinite(pageNum) && pageNum >= 1) {
      map.set(pageNum, href);
    }
  });
  return map;
}

export function isGalleryUnavailableHtml(html: string): boolean {
  return (
    html.includes("This gallery has been removed or is unavailable") ||
    html.includes("Gallery Not Available - E-Hentai")
  );
}

export function parseGalleryPage(
  html: string,
  contentId: string
): ParsedGalleryPage {
  const { gid, token } = parseContentId(contentId);
  const $ = load(html);

  const title = $("#gn").text().trim();
  if (!title) {
    throw new Error(`Gallery ${contentId} could not be parsed from E-Hentai.`);
  }
  const japaneseTitle = $("#gj").text().trim() || undefined;

  const gd1Style = $("#gd1 div").attr("style") ?? $("#gd1").attr("style") ?? "";
  const coverImage =
    BG_URL_RE.exec(gd1Style)?.[2] ??
    $("#gd1 img").attr("src") ??
    "";

  const category = $("#gdc").text().trim() || undefined;
  const uploader = $("#gdn a").first().text().trim() || undefined;

  let posted: string | undefined;
  let language: string | undefined;
  let fileSize: string | undefined;
  let pageCount = 0;
  let favorites: number | undefined;
  const relatedRefs: { gid: number; token: string }[] = [];
  const seenRefs = new Set<number>([parseInt(gid, 10)]);

  $("#gdd tr").each((_, tr) => {
    const key = $(tr).find(".gdt1").text().replace(":", "").trim().toLowerCase();
    const valCell = $(tr).find(".gdt2");
    const val = valCell.text().replace(/\u00a0/g, " ").trim();
    switch (key) {
      case "posted":
        posted = val;
        break;
      case "language":
        language = val.replace(/\bTR$/i, "").trim();
        break;
      case "file size":
        fileSize = val;
        break;
      case "length":
        pageCount = parseCountNumber(val) ?? 0;
        break;
      case "favorited":
        favorites = /never/i.test(val) ? 0 : (parseCountNumber(val) ?? 0);
        break;
      case "parent": {
        const parentHref = valCell.find("a[href*='/g/']").attr("href");
        const pm = parentHref ? GALLERY_URL_RE.exec(parentHref) : null;
        if (pm) {
          const pGid = parseInt(pm[1], 10);
          if (!seenRefs.has(pGid)) {
            seenRefs.add(pGid);
            relatedRefs.push({ gid: pGid, token: pm[2].toLowerCase() });
          }
        }
        break;
      }
    }
  });

  $("#gnd a[href*='/g/']").each((_, a) => {
    const href = $(a).attr("href");
    const nm = href ? GALLERY_URL_RE.exec(href) : null;
    if (nm) {
      const nGid = parseInt(nm[1], 10);
      if (!seenRefs.has(nGid)) {
        seenRefs.add(nGid);
        relatedRefs.push({ gid: nGid, token: nm[2].toLowerCase() });
      }
    }
  });

  const ratingMatch = /([\d.]+)/.exec($("#rating_label").text());
  const ratingNum = ratingMatch ? parseFloat(ratingMatch[1]) : NaN;
  const rating = Number.isFinite(ratingNum) ? ratingNum : undefined;

  // Uploader comment (`#comment_0`) serves as the gallery description when present.
  const commentEl = $("#comment_0");
  let summary: string | undefined;
  if (commentEl.length > 0) {
    const withNewlines = (commentEl.html() ?? "").replace(/<br\s*\/?>/gi, "\n");
    const text = load(withNewlines, null, false)
      .text()
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text) summary = text;
  }

  const tagsByNamespace = new Map<string, string[]>();
  $("#taglist tr").each((_, tr) => {
    const ns = $(tr)
      .find("td.tc")
      .text()
      .replace(":", "")
      .trim()
      .toLowerCase();
    if (!ns) return;
    const values = $(tr)
      .find("td div a")
      .map((__, a) => {
        const raw = $(a).text().trim();
        // Strip secondary romanized/original pipe suffix if present (`a | b` -> `a`).
        return raw.includes(" | ") ? raw.split(" | ")[0].trim() : raw;
      })
      .get()
      .filter(Boolean);
    if (values.length > 0) {
      tagsByNamespace.set(ns, values);
    }
  });

  const viewerUrls = parseViewerLinks(html);
  if (!pageCount && viewerUrls.size > 0) {
    pageCount = viewerUrls.size;
  }

  let maxThumbPageIndex = 0;
  $("table.ptt a").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const pm = /[?&]p=(\d+)/.exec(href);
    if (pm) {
      const idx = parseInt(pm[1], 10);
      if (idx > maxThumbPageIndex) maxThumbPageIndex = idx;
    }
  });

  return {
    gid,
    token,
    title,
    japaneseTitle,
    coverImage,
    category,
    uploader,
    posted,
    language,
    fileSize,
    pageCount,
    favorites,
    rating,
    summary,
    tagsByNamespace,
    relatedRefs,
    viewerUrls,
    totalThumbPages: maxThumbPageIndex + 1,
  };
}

/** Builds a fallback `ParsedGalleryPage` from E-Hentai's JSON `gdata` API. */
export function gmetadataToGalleryPage(meta: EHentaiGMetadata): ParsedGalleryPage {
  const tagsByNamespace = new Map<string, string[]>();
  for (const raw of meta.tags ?? []) {
    const colon = raw.indexOf(":");
    const ns = colon > 0 ? raw.slice(0, colon).toLowerCase() : "other";
    const val = colon > 0 ? raw.slice(colon + 1) : raw;
    const list = tagsByNamespace.get(ns) ?? [];
    list.push(val);
    tagsByNamespace.set(ns, list);
  }

  const langTag = (tagsByNamespace.get("language") ?? []).find(
    (l) => l !== "translated" && l !== "rewrite"
  );
  const postedSec = parseInt(meta.posted, 10);
  const postedDate = Number.isFinite(postedSec)
    ? new Date(postedSec * 1000).toISOString().slice(0, 16).replace("T", " ")
    : undefined;
  const ratingNum = parseFloat(meta.rating);

  const relatedRefs: { gid: number; token: string }[] = [];
  if (meta.parent_gid && meta.parent_key) {
    relatedRefs.push({
      gid: parseInt(meta.parent_gid, 10),
      token: meta.parent_key.toLowerCase(),
    });
  }
  if (
    meta.first_gid &&
    meta.first_key &&
    meta.first_gid !== meta.parent_gid &&
    meta.first_gid !== String(meta.gid)
  ) {
    relatedRefs.push({
      gid: parseInt(meta.first_gid, 10),
      token: meta.first_key.toLowerCase(),
    });
  }

  return {
    gid: String(meta.gid),
    token: meta.token.toLowerCase(),
    title: meta.title,
    japaneseTitle: meta.title_jpn?.trim() || undefined,
    coverImage: meta.thumb || "",
    category: meta.category,
    uploader: meta.uploader || undefined,
    posted: postedDate,
    language: langTag ? languageTitle(langTag) : "Japanese",
    fileSize:
      meta.filesize > 0
        ? `${(meta.filesize / (1024 * 1024)).toFixed(1)} MiB`
        : undefined,
    pageCount: parseInt(meta.filecount, 10) || 0,
    rating: Number.isFinite(ratingNum) ? ratingNum : undefined,
    tagsByNamespace,
    relatedRefs,
    viewerUrls: new Map(),
    totalThumbPages: 0,
  };
}

function linkedTag(ns: EHNamespace, value: string, label = value): Tag {
  const term = formatSearchTerm(ns, value);
  return {
    id: `${ns}:${value.toLowerCase()}`,
    title: label,
    destination: ItemListDestination(
      { key: `${QUERY_LIST_PREFIX}${term}` },
      label
    ),
  };
}

function readingModeFor(gallery: ParsedGalleryPage): ReadingMode {
  const allTags = new Set(
    [...gallery.tagsByNamespace.values()].flat().map((t) => t.toLowerCase())
  );
  if (allTags.has("webtoon") || allTags.has("long strip")) {
    return ReadingMode.VERTICAL;
  }
  const catId = normalizeCategoryId(gallery.category);
  if (catId === "doujinshi" || catId === "manga") {
    return ReadingMode.PAGED_MANGA;
  }
  return ReadingMode.PAGED_COMIC;
}

export function toChapter(
  gallery: ParsedGalleryPage,
  contentId: string,
  baseUrl = EH_BASE_URL
): Chapter {
  const pages = gallery.pageCount;
  const langTags = gallery.tagsByNamespace.get("language") ?? [];
  const explicitLang = langTags.find(
    (l) => l !== "translated" && l !== "rewrite"
  );
  const langCode = languageCode(explicitLang ?? gallery.language);

  return {
    id: contentId,
    index: 0,
    number: 1,
    title: `${pages} ${pages === 1 ? "Page" : "Pages"}`,
    language: langCode,
    date: parseEHDate(gallery.posted),
    webUrl: galleryWebUrl(contentId, baseUrl),
  };
}

export function toContent(
  gallery: ParsedGalleryPage,
  contentId: string,
  prefs: Preferences,
  relatedItems: Item[] = [],
  baseUrl = EH_BASE_URL
): Content {
  const primaryTitle = selectTitle(
    gallery.title,
    gallery.japaneseTitle,
    prefs.titleDisplay
  );
  const cleanTitle = cleanShortTitle(gallery.title);
  const additionalTitles = [
    cleanTitle,
    gallery.title,
    gallery.japaneseTitle,
  ].filter(
    (t, idx, arr): t is string =>
      !!t && t !== primaryTitle && arr.indexOf(t) === idx
  );

  const getTags = (ns: string) => gallery.tagsByNamespace.get(ns) ?? [];
  const artists = getTags("artist");
  const groups = getTags("group");
  const cosplayers = getTags("cosplayer");
  const parodies = getTags("parody");
  const characters = getTags("character");
  const languages = getTags("language");
  const reclass = getTags("reclass");

  const genres: Tag[] = [
    ...getTags("female").map((t) => linkedTag("female", t, `${t} ♀`)),
    ...getTags("male").map((t) => linkedTag("male", t, `${t} ♂`)),
    ...getTags("mixed").map((t) => linkedTag("mixed", t)),
    ...getTags("other").map((t) => linkedTag("other", t)),
  ];

  const credits: Credit[] = [
    ...artists.map((a) => ({
      name: a,
      role: "Artist",
      destination: linkedTag("artist", a).destination,
    })),
    ...groups.map((g) => ({
      name: g,
      role: "Circle",
      destination: linkedTag("group", g).destination,
    })),
    ...cosplayers.map((c) => ({
      name: c,
      role: "Cosplayer",
      destination: linkedTag("cosplayer", c).destination,
    })),
    ...(gallery.uploader && gallery.uploader !== "(Disowned)"
      ? [
          {
            name: gallery.uploader,
            role: "Uploader",
            destination: linkedTag("uploader", gallery.uploader).destination,
          },
        ]
      : []),
  ];

  const properties: TagSection[] = [
    {
      id: "parodies",
      title: "Parodies",
      tags: parodies.map((p) => linkedTag("parody", p)),
    },
    {
      id: "characters",
      title: "Characters",
      tags: characters.map((c) => linkedTag("character", c)),
    },
    {
      id: "artists",
      title: "Artists",
      tags: artists.map((a) => linkedTag("artist", a)),
    },
    {
      id: "groups",
      title: "Groups",
      tags: groups.map((g) => linkedTag("group", g)),
    },
    {
      id: "cosplayers",
      title: "Cosplayers",
      tags: cosplayers.map((c) => linkedTag("cosplayer", c)),
    },
    {
      id: "languages",
      title: "Languages",
      tags: languages.map((l) =>
        linkedTag("language", l, languageTitle(l) ?? l)
      ),
    },
    {
      id: "reclass",
      title: "Reclass",
      tags: reclass.map((r) => linkedTag("reclass", r)),
    },
  ].filter((s) => s.tags.length > 0);

  const details: Record<string, string> = {};
  if (gallery.category) {
    details["Category"] = categoryTitle(gallery.category) ?? gallery.category;
  }
  if (gallery.language) details["Language"] = gallery.language;
  details["Pages"] = String(gallery.pageCount);
  if (gallery.fileSize) details["File Size"] = gallery.fileSize;
  if (gallery.posted) details["Posted"] = gallery.posted.slice(0, 10);
  details["Gallery ID"] = gallery.gid;

  const hasStats =
    gallery.rating !== undefined || gallery.favorites !== undefined;

  return {
    title: primaryTitle,
    additionalTitles: additionalTitles.length ? additionalTitles : undefined,
    coverImage: gallery.coverImage,
    webUrl: galleryWebUrl(contentId, baseUrl),
    rating:
      normalizeCategoryId(gallery.category) === "non-h"
        ? ContentRating.SUGGESTIVE
        : ContentRating.MATURE,
    status: ContentStatus.COMPLETED,
    contentType:
      normalizeCategoryId(gallery.category) === "western"
        ? ContentType.COMIC
        : ContentType.MANGA,
    readingMode: readingModeFor(gallery),
    summary: gallery.summary,
    statistics: hasStats
      ? { rating: gallery.rating, favorites: gallery.favorites }
      : undefined,
    credits: credits.length ? credits : undefined,
    genres: genres.length ? genres : undefined,
    properties: properties.length ? properties : undefined,
    additionalDetails: details,
    collections: relatedItems.length
      ? [{ id: "related", title: "Related Versions", items: relatedItems }]
      : undefined,
    chapters: [toChapter(gallery, contentId, baseUrl)],
  };
}

/** Parses `/s/{ptoken}/{gid}-{page}` HTML for its H@H image URL, fullimg link, and `nl` retry key. */
export function parseReaderPage(html: string): ResolvedReaderImage {
  const $ = load(html);
  const imgUrl = $("#img").attr("src")?.trim() ?? "";
  if (!imgUrl) {
    throw new Error("Could not locate page image on E-Hentai viewer page.");
  }
  if (/\/509s?\.gif(?:\?|$)/i.test(imgUrl)) {
    throw new Error(
      "E-Hentai image viewing quota (509) reached. Please wait for your quota to reset."
    );
  }

  const fullImgHref = $("#i7 a[href*='fullimg'], a[href*='fullimg']")
    .first()
    .attr("href");
  const loadFailAttr =
    $("#loadfail").attr("onclick") ?? $("#img").attr("onerror") ?? "";
  const nlToken = /nl\(['"]([^'"]+)['"]\)/.exec(loadFailAttr)?.[1];

  return {
    imageUrl: imgUrl,
    fullImageUrl:
      fullImgHref && /^https?:\/\//i.test(fullImgHref)
        ? fullImgHref.replace(/&amp;/g, "&")
        : undefined,
    nlToken,
    fetchedAt: Date.now(),
  };
}

/** Resolves `{gid}/{token}` from a `/s/{ptoken}/{gid}-{page}` reader page's back-to-gallery link. */
export function parseGalleryIdFromReader(html: string): string | null {
  const $ = load(html);
  const href = $(".sb a[href*='/g/'], a[href*='/g/']").first().attr("href");
  if (!href) return null;
  const m = GALLERY_URL_RE.exec(href);
  return m ? `${m[1]}/${m[2].toLowerCase()}` : null;
}
