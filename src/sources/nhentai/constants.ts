import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://nhentai.net";
export const API_URL = `${BASE_URL}/api/v2`;
export const USER_AGENT = "Suwatte-nhentai/1.0 (+https://suwatte.mantton.com)";

export const DEFAULT_IMAGE_SERVERS = [
  "https://i1.nhentai.net",
  "https://i2.nhentai.net",
  "https://i3.nhentai.net",
  "https://i4.nhentai.net",
];

export const DEFAULT_THUMB_SERVERS = [
  "https://t1.nhentai.net",
  "https://t2.nhentai.net",
  "https://t3.nhentai.net",
  "https://t4.nhentai.net",
];

export const PAGE_SIZE = 25;
export const CDN_TTL_MS = 60 * 60 * 1000;
export const LIST_CACHE_TTL_MS = 2 * 60 * 1000;

export const PREF_HIDDEN_TAGS = "pref_hidden_tags";
export const PREF_TITLE_DISPLAY = "pref_title_display";
export const PREF_API_KEY = "pref_api_key";
export const PREF_USE_ACCOUNT_BLACKLIST = "pref_use_account_blacklist";
export const SECURE_API_KEY = "nhentai_api_key";

export interface LanguageDefinition {
  name: string;
  code: string;
  title: string;
  tagId: number;
}

/** Site languages exposed as dedicated catalog variants. */
export const LANGUAGES: LanguageDefinition[] = [
  { name: "english", code: "en", title: "English", tagId: 12227 },
  { name: "japanese", code: "ja", title: "Japanese", tagId: 6346 },
  { name: "chinese", code: "zh", title: "Chinese", tagId: 29963 },
];

/** Additional rare/meta language tags present in nhentai's taxonomy. */
export const EXTRA_LANGUAGES: LanguageDefinition[] = [
  { name: "translated", code: "mul", title: "Translated", tagId: 17249 },
  { name: "textless", code: "zxx", title: "Textless", tagId: 165194 },
  { name: "textless narrative", code: "zxx", title: "Textless", tagId: 165826 },
  {
    name: "japanese | definition revised please read the wiki",
    code: "ja",
    title: "Japanese",
    tagId: 168289,
  },
  { name: "ukrainian", code: "uk", title: "Ukrainian", tagId: 145695 },
  { name: "hebrew", code: "he", title: "Hebrew", tagId: 160067 },
  { name: "arabic", code: "ar", title: "Arabic", tagId: 141693 },
  { name: "khmer", code: "km", title: "Khmer", tagId: 163209 },
  { name: "romanian", code: "ro", title: "Romanian", tagId: 158626 },
  { name: "greek", code: "el", title: "Greek", tagId: 156976 },
  { name: "turkish", code: "tr", title: "Turkish", tagId: 145530 },
  { name: "czech", code: "cs", title: "Czech", tagId: 142066 },
];

const ALL_KNOWN_LANGUAGES = [...LANGUAGES, ...EXTRA_LANGUAGES];
const LANGUAGE_BY_TAG_ID = new Map<number, LanguageDefinition>(
  ALL_KNOWN_LANGUAGES.map((l) => [l.tagId, l])
);

export const ALL_LANGUAGES = "all";

export function languageCode(name?: string | null): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  const match = ALL_KNOWN_LANGUAGES.find((l) => l.name === lower);
  if (!match || match.name === "translated") return undefined;
  return match.code;
}

export function languageTitle(name?: string | null): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  return (
    ALL_KNOWN_LANGUAGES.find((l) => l.name === lower)?.title ??
    name.replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Resolves a gallery's primary spoken/written language from its tag IDs. */
export function languageFromTagIds(tagIds?: number[] | null): LanguageDefinition | undefined {
  if (!tagIds?.length) return undefined;
  for (const id of tagIds) {
    const lang = LANGUAGE_BY_TAG_ID.get(id);
    if (lang && lang.name !== "translated") return lang;
  }
  return undefined;
}

export const LANGUAGE_OPTIONS: LabeledOption[] = [
  { id: ALL_LANGUAGES, title: "All Languages" },
  ...LANGUAGES.map((l) => ({ id: l.name, title: l.title })),
  { id: "translated", title: "Translated" },
  { id: "textless", title: "Textless" },
];

export interface CategoryDefinition {
  id: string;
  title: string;
  tagId: number;
}

export const CATEGORIES: CategoryDefinition[] = [
  { id: "doujinshi", title: "Doujinshi", tagId: 33172 },
  { id: "manga", title: "Manga", tagId: 33173 },
  { id: "misc", title: "Misc", tagId: 153091 },
];

const CATEGORY_BY_TAG_ID = new Map<number, CategoryDefinition>(
  CATEGORIES.map((c) => [c.tagId, c])
);

export const CATEGORY_OPTIONS: LabeledOption[] = CATEGORIES.map(({ id, title }) => ({
  id,
  title,
}));

export function categoryTitle(category?: string | null): string | undefined {
  if (!category) return undefined;
  const lower = category.toLowerCase();
  return (
    CATEGORIES.find((c) => c.id === lower)?.title ??
    category.replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function categoryFromTagIds(tagIds?: number[] | null): CategoryDefinition | undefined {
  if (!tagIds?.length) return undefined;
  for (const id of tagIds) {
    const category = CATEGORY_BY_TAG_ID.get(id);
    if (category) return category;
  }
  return undefined;
}

/** Known tag IDs seeded at startup so single-tag queries can use `/galleries/tagged`. */
export const SEEDED_TAG_IDS: [string, number][] = [
  ...LANGUAGES.map((l): [string, number] => [`language:${l.name}`, l.tagId]),
  ["language:translated", 17249],
  ["language:textless", 165194],
  ...CATEGORIES.map((c): [string, number] => [`category:${c.id}`, c.tagId]),
];

export type SortKey =
  | "date"
  | "popular-today"
  | "popular-week"
  | "popular-month"
  | "popular";

export const SORTS: { id: SortKey; title: string }[] = [
  { id: "date", title: "Date Added" },
  { id: "popular-today", title: "Popular Today" },
  { id: "popular-week", title: "Popular This Week" },
  { id: "popular-month", title: "Popular This Month" },
  { id: "popular", title: "Popular All Time" },
];

export const SORT_OPTIONS: LabeledOption[] = SORTS.map(({ id, title }) => ({ id, title }));

export const FEEDS: { id: string; title: string }[] = [
  { id: "date", title: "Latest" },
  { id: "popular-today", title: "Popular Today" },
  { id: "popular-week", title: "Popular This Week" },
  { id: "popular-month", title: "Popular This Month" },
  { id: "popular", title: "Popular All Time" },
];

export const FAVORITES_FEED = { id: "favorites", title: "Favorites" };

export const UPLOADED_ANY = "any";

export const UPLOADED_OPTIONS: LabeledOption[] = [
  { id: UPLOADED_ANY, title: "Any Time" },
  { id: "<1d", title: "Past 24 Hours" },
  { id: "<7d", title: "Past Week" },
  { id: "<30d", title: "Past Month" },
  { id: "<1y", title: "Past Year" },
];

/** Item list keys with this prefix carry a site-syntax search query, e.g. from a tapped tag. */
export const QUERY_LIST_PREFIX = "q:";

export type TitleDisplay = "english" | "pretty" | "japanese";

export const TITLE_DISPLAY_OPTIONS: LabeledOption[] = [
  { id: "english", title: "Full Title" },
  { id: "pretty", title: "Short Title (Clean)" },
  { id: "japanese", title: "Japanese Title (when available)" },
];
