import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://hitomi.la";
export const CDN_DOMAIN = "gold-usergeneratedcontent.net";
export const LTN_URL = `https://ltn.${CDN_DOMAIN}`;
export const THUMB_URL = `https://tn.${CDN_DOMAIN}`;

/** Galleries per page; matches the site's listing pages. */
export const PAGE_SIZE = 25;
/** The site refreshes gg.js every 30 minutes; refresh a little sooner. */
export const GG_TTL_MS = 20 * 60 * 1000;
export const INDEX_VERSION_TTL_MS = 10 * 60 * 1000;

export const PREF_HIDDEN_TAGS = "pref_hidden_tags";
export const PREF_HIDE_ANIME = "pref_hide_anime";
export const PREF_IMAGE_FORMAT = "pref_image_format";

/** Hitomi's language names (as used in nozomi paths) and their BCP 47 codes. */
export const LANGUAGES: { name: string; code: string; title: string }[] = [
  { name: "english", code: "en", title: "English" },
  { name: "japanese", code: "ja", title: "Japanese" },
  { name: "chinese", code: "zh", title: "Chinese" },
  { name: "korean", code: "ko", title: "Korean" },
  { name: "spanish", code: "es", title: "Spanish" },
  { name: "portuguese", code: "pt", title: "Portuguese" },
  { name: "french", code: "fr", title: "French" },
  { name: "german", code: "de", title: "German" },
  { name: "italian", code: "it", title: "Italian" },
  { name: "russian", code: "ru", title: "Russian" },
  { name: "ukrainian", code: "uk", title: "Ukrainian" },
  { name: "polish", code: "pl", title: "Polish" },
  { name: "czech", code: "cs", title: "Czech" },
  { name: "slovak", code: "sk", title: "Slovak" },
  { name: "hungarian", code: "hu", title: "Hungarian" },
  { name: "romanian", code: "ro", title: "Romanian" },
  { name: "bulgarian", code: "bg", title: "Bulgarian" },
  { name: "serbian", code: "sr", title: "Serbian" },
  { name: "albanian", code: "sq", title: "Albanian" },
  { name: "greek", code: "el", title: "Greek" },
  { name: "turkish", code: "tr", title: "Turkish" },
  { name: "dutch", code: "nl", title: "Dutch" },
  { name: "danish", code: "da", title: "Danish" },
  { name: "swedish", code: "sv", title: "Swedish" },
  { name: "norwegian", code: "no", title: "Norwegian" },
  { name: "finnish", code: "fi", title: "Finnish" },
  { name: "icelandic", code: "is", title: "Icelandic" },
  { name: "estonian", code: "et", title: "Estonian" },
  { name: "catalan", code: "ca", title: "Catalan" },
  { name: "latin", code: "la", title: "Latin" },
  { name: "esperanto", code: "eo", title: "Esperanto" },
  { name: "vietnamese", code: "vi", title: "Vietnamese" },
  { name: "thai", code: "th", title: "Thai" },
  { name: "indonesian", code: "id", title: "Indonesian" },
  { name: "javanese", code: "jv", title: "Javanese" },
  { name: "tagalog", code: "tl", title: "Tagalog" },
  { name: "cebuano", code: "ceb", title: "Cebuano" },
  { name: "khmer", code: "km", title: "Khmer" },
  { name: "burmese", code: "my", title: "Burmese" },
  { name: "mongolian", code: "mn", title: "Mongolian" },
  { name: "hindi", code: "hi", title: "Hindi" },
  { name: "arabic", code: "ar", title: "Arabic" },
  { name: "persian", code: "fa", title: "Persian" },
  { name: "hebrew", code: "he", title: "Hebrew" },
];

export const ALL_LANGUAGES = "all";

export function languageCode(name?: string | null): string | undefined {
  return LANGUAGES.find((l) => l.name === name)?.code;
}

export function languageTitle(name?: string | null): string | undefined {
  if (!name) return undefined;
  return (
    LANGUAGES.find((l) => l.name === name)?.title ??
    name.replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export const LANGUAGE_OPTIONS: LabeledOption[] = [
  { id: ALL_LANGUAGES, title: "All Languages" },
  ...LANGUAGES.map((l) => ({ id: l.name, title: l.title })),
];

export const TYPE_OPTIONS: LabeledOption[] = [
  { id: "doujinshi", title: "Doujinshi" },
  { id: "manga", title: "Manga" },
  { id: "artistcg", title: "Artist CG" },
  { id: "gamecg", title: "Game CG" },
  { id: "imageset", title: "Image Set" },
  { id: "anime", title: "Anime" },
];

export function typeTitle(type?: string | null): string | undefined {
  if (!type) return undefined;
  return TYPE_OPTIONS.find((t) => t.id === type)?.title ?? type;
}

export type OrderBy = "date" | "popular";
export type OrderByKey = "added" | "published" | "today" | "week" | "month" | "year";

export interface SortDefinition {
  id: string;
  title: string;
  orderby: OrderBy;
  orderbykey: OrderByKey;
}

export const SORTS: SortDefinition[] = [
  { id: "added", title: "Date Added", orderby: "date", orderbykey: "added" },
  { id: "published", title: "Date Published", orderby: "date", orderbykey: "published" },
  { id: "today", title: "Popular Today", orderby: "popular", orderbykey: "today" },
  { id: "week", title: "Popular This Week", orderby: "popular", orderbykey: "week" },
  { id: "month", title: "Popular This Month", orderby: "popular", orderbykey: "month" },
  { id: "year", title: "Popular This Year", orderby: "popular", orderbykey: "year" },
];

export const SORT_OPTIONS: LabeledOption[] = SORTS.map(({ id, title }) => ({ id, title }));

/** Home page feeds, in display order; each is a sort over the variant's whole index. */
export const FEEDS: { id: string; title: string }[] = [
  { id: "added", title: "Latest" },
  { id: "today", title: "Popular Today" },
  { id: "week", title: "Popular This Week" },
  { id: "month", title: "Popular This Month" },
  { id: "year", title: "Popular This Year" },
];

/** Item list keys with this prefix carry a site-syntax search query, e.g. from a tapped tag. */
export const QUERY_LIST_PREFIX = "q:";

export const IMAGE_FORMAT_OPTIONS: LabeledOption[] = [
  { id: "webp", title: "WebP" },
  { id: "avif", title: "AVIF (smaller, when available)" },
];
