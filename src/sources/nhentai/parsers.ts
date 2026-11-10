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
  WebLink,
} from "@suwatte/toolchain";

import {
  ALL_LANGUAGES,
  BASE_URL,
  QUERY_LIST_PREFIX,
  TitleDisplay,
  categoryFromTagIds,
  categoryTitle,
  languageCode,
  languageFromTagIds,
  languageTitle,
} from "./constants";
import { DEFAULT_CDN, thumbnailUrl } from "./images";
import { TagNamespace, formatQueryTerm } from "./search";
import { Preferences } from "./settings";
import {
  CdnConfig,
  NhentaiGalleryDetail,
  NhentaiGalleryTitle,
  NhentaiListItem,
  NhentaiPageInfo,
  NhentaiTag,
} from "./types";

export function galleryUrl(id: string | number): string {
  return `${BASE_URL}/g/${id}/`;
}

export function readerUrl(id: string | number, page = 1): string {
  return `${BASE_URL}/g/${id}/${page}/`;
}

/** Strips leading `(Event) [Circle (Artist)]` and trailing `[Lang] (Parody)` tags. */
export function cleanPrettyTitle(raw: string): string {
  const stripped = raw
    .replace(/^(?:\s*(?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\}))+\s*/, "")
    .replace(/\s*(?:\s*(?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\}))+$/, "")
    .trim();
  return stripped || raw.trim();
}

export function selectListTitle(
  item: NhentaiListItem,
  display: TitleDisplay = "english"
): string {
  if (display === "japanese" && item.japanese_title?.trim()) {
    return item.japanese_title.trim();
  }
  if (display === "pretty") {
    return cleanPrettyTitle(item.english_title);
  }
  return item.english_title.trim() || String(item.id);
}

export function selectDetailTitle(
  title: NhentaiGalleryTitle,
  display: TitleDisplay = "english",
  fallbackId?: string
): string {
  if (display === "japanese" && title.japanese?.trim()) {
    return title.japanese.trim();
  }
  if (display === "pretty" && title.pretty?.trim()) {
    return title.pretty.trim();
  }
  return title.english?.trim() || title.pretty?.trim() || fallbackId || "Untitled";
}

export function toItem(
  item: NhentaiListItem,
  variantLanguage: string,
  cdn: CdnConfig = DEFAULT_CDN,
  titleDisplay: TitleDisplay = "english"
): Item {
  const category = categoryFromTagIds(item.tag_ids);
  const language = languageFromTagIds(item.tag_ids);
  const subtitle = [
    category?.title,
    variantLanguage === ALL_LANGUAGES ? language?.title : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: String(item.id),
    title: selectListTitle(item, titleDisplay),
    subtitle: subtitle || undefined,
    coverImage: thumbnailUrl(item.thumbnail, item.media_id, cdn),
    webUrl: galleryUrl(item.id),
    statistics:
      typeof item.num_favorites === "number"
        ? { favorites: item.num_favorites }
        : undefined,
    rating: ContentRating.MATURE,
  };
}

export function detailToItem(
  gallery: NhentaiGalleryDetail,
  variantLanguage: string,
  cdn: CdnConfig = DEFAULT_CDN,
  titleDisplay: TitleDisplay = "english"
): Item {
  const categoryTag = gallery.tags.find((t) => t.type === "category");
  const languageTag = gallery.tags.find(
    (t) => t.type === "language" && t.name.toLowerCase() !== "translated"
  );
  const subtitle = [
    categoryTitle(categoryTag?.name),
    variantLanguage === ALL_LANGUAGES ? languageTitle(languageTag?.name) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: String(gallery.id),
    title: selectDetailTitle(gallery.title, titleDisplay, String(gallery.id)),
    subtitle: subtitle || undefined,
    coverImage: thumbnailUrl(
      gallery.cover?.path || gallery.thumbnail?.path,
      gallery.media_id,
      cdn
    ),
    webUrl: galleryUrl(gallery.id),
    statistics: { favorites: gallery.num_favorites },
    rating: ContentRating.MATURE,
  };
}

function linkedTag(ns: TagNamespace, tag: NhentaiTag, title = tag.name): Tag {
  const term = formatQueryTerm(ns, tag.name);
  return {
    id: term,
    title,
    destination: ItemListDestination({ key: `${QUERY_LIST_PREFIX}${term}` }, title),
  };
}

function isTallWebtoon(pages: NhentaiPageInfo[]): boolean {
  if (pages.length < 2) return false;
  const tall = pages.filter((p) => p.width > 0 && p.height / p.width >= 3).length;
  return tall / pages.length >= 0.5;
}

function readingMode(gallery: NhentaiGalleryDetail): ReadingMode {
  const tagNames = new Set(gallery.tags.map((t) => t.name.toLowerCase()));
  if (tagNames.has("webtoon") || isTallWebtoon(gallery.pages ?? [])) {
    return ReadingMode.VERTICAL;
  }
  if (
    tagNames.has("comic") ||
    tagNames.has("western") ||
    tagNames.has("western cg") ||
    tagNames.has("western imageset") ||
    tagNames.has("western non-h")
  ) {
    return ReadingMode.PAGED_COMIC;
  }
  return ReadingMode.PAGED_MANGA;
}

export function toChapter(gallery: NhentaiGalleryDetail, contentId: string): Chapter {
  const pages = gallery.num_pages || gallery.pages?.length || 0;
  const langTag = gallery.tags.find(
    (t) => t.type === "language" && t.name.toLowerCase() !== "translated"
  );
  const date = gallery.upload_date ? new Date(gallery.upload_date * 1000) : undefined;

  return {
    id: contentId,
    index: 0,
    number: 1,
    title: `${pages} ${pages === 1 ? "Page" : "Pages"}`,
    language: languageCode(langTag?.name),
    date: date && !isNaN(date.getTime()) ? date : undefined,
    webUrl: readerUrl(contentId, 1),
  };
}

function collectSocialLinks(tags: NhentaiTag[]): WebLink[] {
  const seen = new Set<string>();
  const out: WebLink[] = [];
  for (const tag of tags) {
    if (tag.type !== "artist" && tag.type !== "group") continue;
    for (const link of tag.links ?? []) {
      if (!link?.url || !/^https?:\/\//i.test(link.url) || seen.has(link.url)) {
        continue;
      }
      seen.add(link.url);
      out.push({
        title: `${tag.name} (${link.label || link.service})`,
        url: link.url,
      });
    }
  }
  return out;
}

export function isListItemVisible(
  item: NhentaiListItem,
  _prefs: Preferences,
  hiddenTagIds?: Set<number>
): boolean {
  // if (_prefs.useAccountBlacklist && item.blacklisted) return false;
  if (hiddenTagIds?.size && item.tag_ids?.some((id) => hiddenTagIds.has(id))) {
    return false;
  }
  return true;
}

export function toContent(
  gallery: NhentaiGalleryDetail,
  contentId: string,
  variantLanguage: string,
  cdn: CdnConfig = DEFAULT_CDN,
  prefs?: Preferences,
  hiddenTagIds?: Set<number>
): Content {
  const titleDisplay = prefs?.titleDisplay ?? "english";
  const primaryTitle = selectDetailTitle(gallery.title, titleDisplay, contentId);

  const additionalTitles = [
    gallery.title.pretty?.trim(),
    gallery.title.english?.trim(),
    gallery.title.japanese?.trim(),
  ].filter(
    (t, idx, arr): t is string =>
      !!t && t !== primaryTitle && arr.indexOf(t) === idx
  );

  const byType = (type: string) => gallery.tags.filter((t) => t.type === type);
  const contentTags = byType("tag");
  const artists = byType("artist");
  const groups = byType("group");
  const parodies = byType("parody");
  const characters = byType("character");
  const categories = byType("category");
  const languages = byType("language");

  const credits: Credit[] = [
    ...artists.map((a) => ({
      name: a.name,
      role: "Artist",
      destination: linkedTag("artist", a).destination,
    })),
    ...groups.map((g) => ({
      name: g.name,
      role: "Circle",
      destination: linkedTag("group", g).destination,
    })),
  ];

  const genres = contentTags.map((t) => linkedTag("tag", t));

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
      id: "categories",
      title: "Categories",
      tags: categories.map((c) =>
        linkedTag("category", c, categoryTitle(c.name) ?? c.name)
      ),
    },
    {
      id: "languages",
      title: "Languages",
      tags: languages.map((l) =>
        linkedTag("language", l, languageTitle(l.name) ?? l.name)
      ),
    },
  ].filter((section) => section.tags.length > 0);

  const details: Record<string, string> = {};
  const primaryCategory = categories[0]?.name;
  const primaryLanguage = languages.find(
    (l) => l.name.toLowerCase() !== "translated"
  )?.name;
  if (primaryCategory) details["Category"] = categoryTitle(primaryCategory) ?? primaryCategory;
  if (primaryLanguage) details["Language"] = languageTitle(primaryLanguage) ?? primaryLanguage;
  details["Pages"] = String(gallery.num_pages || gallery.pages?.length || 0);
  if (gallery.upload_date) {
    const uploaded = new Date(gallery.upload_date * 1000);
    if (!isNaN(uploaded.getTime())) {
      details["Uploaded"] = uploaded.toISOString().slice(0, 10);
    }
  }
  if (gallery.scanlator?.trim()) {
    details["Scanlator"] = gallery.scanlator.trim();
  }
  details["Gallery ID"] = `#${contentId}`;

  const relatedItems = (gallery.related ?? [])
    .filter((item) =>
      prefs ? isListItemVisible(item, prefs, hiddenTagIds) : true
    )
    .map((item) => toItem(item, variantLanguage, cdn, titleDisplay));

  const links = collectSocialLinks(gallery.tags);

  return {
    title: primaryTitle,
    additionalTitles: additionalTitles.length ? additionalTitles : undefined,
    coverImage: thumbnailUrl(
      gallery.cover?.path || gallery.thumbnail?.path,
      gallery.media_id,
      cdn
    ),
    webUrl: galleryUrl(contentId),
    rating: ContentRating.MATURE,
    status: ContentStatus.COMPLETED,
    contentType: ContentType.MANGA,
    readingMode: readingMode(gallery),
    statistics: { favorites: gallery.num_favorites },
    credits: credits.length ? credits : undefined,
    genres: genres.length ? genres : undefined,
    properties: properties.length ? properties : undefined,
    links: links.length ? links : undefined,
    additionalDetails: details,
    collections: relatedItems.length
      ? [{ id: "related", title: "Related Galleries", items: relatedItems }]
      : undefined,
    chapters: [toChapter(gallery, contentId)],
  };
}
