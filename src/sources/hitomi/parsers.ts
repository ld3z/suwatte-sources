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

import {
  ALL_LANGUAGES,
  BASE_URL,
  QUERY_LIST_PREFIX,
  languageCode,
  languageTitle,
  typeTitle,
} from "./constants";
import { isSet, thumbnailUrl } from "./images";
import { HitomiGallery } from "./types";

/** `2016-03-27 13:37:33.612-05` (or a bare date) as a Date. */
export function parseDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?([+-]\d{2})(?::?(\d{2}))?)?/.exec(
    value.trim()
  );
  if (!m) return undefined;
  const date = m[2]
    ? new Date(`${m[1]}T${m[2]}${m[3] ?? ""}${m[4] ?? "Z"}${m[4] ? `:${m[5] ?? "00"}` : ""}`)
    : new Date(`${m[1]}T00:00:00Z`);
  return isNaN(date.getTime()) ? undefined : date;
}

export function galleryUrl(gallery: HitomiGallery): string {
  return gallery.galleryurl
    ? `${BASE_URL}${gallery.galleryurl}`
    : `${BASE_URL}/galleries/${gallery.id}.html`;
}

export function readerUrl(id: string): string {
  return `${BASE_URL}/reader/${id}.html`;
}

/** The site's search syntax for one term, so a tapped tag opens its listing. */
function queryTerm(ns: string, value: string): string {
  return `${ns}:${value.trim().toLowerCase().replace(/\s+/g, "_")}`;
}

function linkedTag(ns: string, value: string, title = value): Tag {
  const term = queryTerm(ns, value);
  return {
    id: term,
    title,
    destination: ItemListDestination({ key: `${QUERY_LIST_PREFIX}${term}` }, title),
  };
}

function galleryTags(gallery: HitomiGallery): Tag[] {
  return (gallery.tags ?? [])
    .filter((t) => t?.tag)
    .map((t) => {
      if (isSet(t.female)) return linkedTag("female", t.tag, `${t.tag} ♀`);
      if (isSet(t.male)) return linkedTag("male", t.tag, `${t.tag} ♂`);
      return linkedTag("tag", t.tag);
    });
}

function names<T>(entries: T[] | null | undefined, pick: (entry: T) => string | undefined): string[] {
  return (entries ?? []).map(pick).filter((v): v is string => !!v);
}

/**
 * Lowercased keys a hidden-tags preference can match: namespaced keys
 * (`female:big breasts`, `artist:x`, `type:anime`) and bare tag names.
 */
export function galleryKeys(gallery: HitomiGallery): Set<string> {
  const keys = new Set<string>();
  for (const t of gallery.tags ?? []) {
    if (!t?.tag) continue;
    const tag = t.tag.toLowerCase();
    keys.add(tag);
    keys.add(`${isSet(t.female) ? "female" : isSet(t.male) ? "male" : "tag"}:${tag}`);
  }
  const add = (ns: string, values: string[]) =>
    values.forEach((v) => keys.add(`${ns}:${v.toLowerCase()}`));
  add("artist", names(gallery.artists, (a) => a.artist));
  add("group", names(gallery.groups, (g) => g.group));
  add("series", names(gallery.parodys, (p) => p.parody));
  add("character", names(gallery.characters, (c) => c.character));
  if (gallery.type) keys.add(`type:${gallery.type.toLowerCase()}`);
  if (gallery.language) keys.add(`language:${gallery.language.toLowerCase()}`);
  return keys;
}

export function toItem(gallery: HitomiGallery, variantLanguage: string): Item {
  const subtitle = [
    typeTitle(gallery.type),
    variantLanguage === ALL_LANGUAGES ? languageTitle(gallery.language) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: String(gallery.id),
    title: gallery.title,
    subtitle: subtitle || undefined,
    coverImage: thumbnailUrl(gallery.files?.[0]),
    webUrl: galleryUrl(gallery),
    rating: ContentRating.MATURE,
  };
}

function isWebtoon(gallery: HitomiGallery): boolean {
  const files = gallery.files ?? [];
  if (files.length < 2) return false;
  const tall = files.filter((f) => f.width > 0 && f.height / f.width >= 3).length;
  return tall / files.length >= 0.5;
}

function readingMode(gallery: HitomiGallery): ReadingMode {
  if (isWebtoon(gallery)) return ReadingMode.VERTICAL;
  return gallery.type === "doujinshi" || gallery.type === "manga"
    ? ReadingMode.PAGED_MANGA
    : ReadingMode.PAGED_COMIC;
}

export function toChapter(gallery: HitomiGallery, contentId: string): Chapter {
  const pages = gallery.files?.length ?? 0;
  return {
    id: contentId,
    index: 0,
    number: 1,
    title: `${pages} ${pages === 1 ? "Page" : "Pages"}`,
    language: languageCode(gallery.language),
    date: parseDate(gallery.date),
    webUrl: readerUrl(contentId),
  };
}

export function toContent(
  gallery: HitomiGallery,
  contentId: string,
  related: Item[] = []
): Content {
  const artists = names(gallery.artists, (a) => a.artist);
  const groups = names(gallery.groups, (g) => g.group);
  const series = names(gallery.parodys, (p) => p.parody);
  const characters = names(gallery.characters, (c) => c.character);

  const credits: Credit[] = [
    ...artists.map((name) => ({ name, role: "Artist" })),
    ...groups.map((name) => ({ name, role: "Circle" })),
  ];

  const properties: TagSection[] = [
    { id: "artists", title: "Artists", tags: artists.map((a) => linkedTag("artist", a)) },
    { id: "groups", title: "Groups", tags: groups.map((g) => linkedTag("group", g)) },
    { id: "series", title: "Series", tags: series.map((s) => linkedTag("series", s)) },
    { id: "characters", title: "Characters", tags: characters.map((c) => linkedTag("character", c)) },
  ].filter((section) => section.tags.length > 0);

  const details: Record<string, string> = {};
  const type = typeTitle(gallery.type);
  const language = languageTitle(gallery.language);
  if (type) details["Type"] = type;
  if (language) details["Language"] = language;
  details["Pages"] = String(gallery.files?.length ?? 0);
  const posted = parseDate(gallery.date);
  if (posted) details["Posted"] = posted.toISOString().slice(0, 10);
  const published = parseDate(gallery.datepublished);
  if (published) details["Published"] = published.toISOString().slice(0, 10);
  details["Gallery ID"] = contentId;

  const japaneseTitle = gallery.japanese_title?.trim();
  const genres = galleryTags(gallery);

  return {
    title: gallery.title,
    additionalTitles: japaneseTitle && japaneseTitle !== gallery.title ? [japaneseTitle] : undefined,
    coverImage: thumbnailUrl(gallery.files?.[0]),
    webUrl: galleryUrl(gallery),
    rating: ContentRating.MATURE,
    status: ContentStatus.COMPLETED,
    contentType: ContentType.MANGA,
    readingMode: readingMode(gallery),
    credits: credits.length ? credits : undefined,
    genres: genres.length ? genres : undefined,
    properties: properties.length ? properties : undefined,
    additionalDetails: details,
    collections: related.length
      ? [{ id: "related", title: "Related Galleries", items: related }]
      : undefined,
    chapters: [toChapter(gallery, contentId)],
  };
}

/** Parses a `galleries/{id}.js` script (`var galleryinfo = {...}`). */
export function parseGalleryScript(script: string): HitomiGallery {
  const json = script.slice(script.indexOf("{"), script.lastIndexOf("}") + 1);
  const gallery = JSON.parse(json) as HitomiGallery;
  if (!gallery || !Array.isArray(gallery.files)) {
    throw new Error("Hitomi returned an unreadable gallery.");
  }
  return gallery;
}
