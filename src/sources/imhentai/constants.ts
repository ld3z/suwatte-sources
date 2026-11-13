import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://imhentai.xxx";
export const HOME_URL = `${BASE_URL}/home/`;

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const PAGE_SIZE = 20;
export const GALLERY_CACHE_TTL_MS = 5 * 60 * 1000;

export const PREF_HIDDEN_TAGS = "pref_hidden_tags";
export const PREF_EXCLUDED_CATEGORIES = "pref_excluded_categories";
export const PREF_TITLE_DISPLAY = "pref_title_display";

export interface LanguageDefinition {
  /** Slug used in `/language/{name}/`. */
  name: string;
  /** BCP 47 code used in Suwatte metadata. */
  code: string;
  /** Query flag parameter used in `/search/` and `/advsearch/` (`en`, `jp`, `kr`, ...). */
  param: string;
  title: string;
}

/** IMHentai's 7 search-filterable site languages. */
export const LANGUAGES: LanguageDefinition[] = [
  { name: "english", code: "en", param: "en", title: "English" },
  { name: "japanese", code: "ja", param: "jp", title: "Japanese" },
  { name: "spanish", code: "es", param: "es", title: "Spanish" },
  { name: "french", code: "fr", param: "fr", title: "French" },
  { name: "korean", code: "ko", param: "kr", title: "Korean" },
  { name: "german", code: "de", param: "de", title: "German" },
  { name: "russian", code: "ru", param: "ru", title: "Russian" },
];

/** Additional rare/meta language slugs present on gallery pages. */
export const EXTRA_LANGUAGES: { name: string; code?: string; title?: string }[] = [
  { name: "speechless", code: "zxx", title: "Speechless" },
  { name: "translated" },
  { name: "chinese", code: "zh", title: "Chinese" },
  { name: "portuguese", code: "pt", title: "Portuguese" },
  { name: "thai", code: "th", title: "Thai" },
  { name: "arabic", code: "ar", title: "Arabic" },
  { name: "indonesian", code: "id", title: "Indonesian" },
  { name: "italian", code: "it", title: "Italian" },
  { name: "vietnamese", code: "vi", title: "Vietnamese" },
  { name: "dutch", code: "nl", title: "Dutch" },
];

export const ALL_LANGUAGES = "all";

export function languageByName(name?: string | null): LanguageDefinition | undefined {
  if (!name) return undefined;
  const lower = name.trim().toLowerCase();
  return LANGUAGES.find((l) => l.name === lower || l.param === lower || l.code === lower);
}

export function languageCode(name?: string | null): string | undefined {
  if (!name) return undefined;
  const lower = name.trim().toLowerCase();
  return (
    LANGUAGES.find((l) => l.name === lower)?.code ??
    EXTRA_LANGUAGES.find((l) => l.name === lower)?.code
  );
}

export function languageTitle(name?: string | null): string | undefined {
  if (!name) return undefined;
  const lower = name.trim().toLowerCase();
  if (lower === "translated") return undefined;
  return (
    LANGUAGES.find((l) => l.name === lower)?.title ??
    EXTRA_LANGUAGES.find((l) => l.name === lower)?.title ??
    name.replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export const LANGUAGE_OPTIONS: LabeledOption[] = [
  { id: ALL_LANGUAGES, title: "All Languages" },
  ...LANGUAGES.map((l) => ({ id: l.name, title: l.title })),
  { id: "speechless", title: "Speechless" },
];

export interface CategoryDefinition {
  /** Slug used in `/category/{id}/`. */
  id: string;
  /** Query flag parameter used in `/search/` and `/advsearch/`. */
  param: string;
  title: string;
}

export const CATEGORIES: CategoryDefinition[] = [
  { id: "doujinshi", param: "d", title: "Doujinshi" },
  { id: "manga", param: "m", title: "Manga" },
  { id: "artist-cg", param: "a", title: "Artist CG" },
  { id: "game-cg", param: "g", title: "Game CG" },
  { id: "western", param: "w", title: "Western" },
  { id: "image-set", param: "i", title: "Image Set" },
];

export const CATEGORY_OPTIONS: LabeledOption[] = CATEGORIES.map(({ id, title }) => ({
  id,
  title,
}));

export function normalizeCategoryId(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return (
    CATEGORIES.find((c) => c.id === slug)?.id ??
    CATEGORIES.find((c) => c.id.replace(/-/g, "") === slug.replace(/-/g, ""))?.id
  );
}

export function categoryTitle(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const id = normalizeCategoryId(raw);
  return CATEGORIES.find((c) => c.id === id)?.title ?? raw.trim();
}

export type SortKey = "lt" | "pp" | "tr" | "dl";

export const SORTS: {
  id: SortKey;
  title: string;
  rootPath: string;
}[] = [
  { id: "lt", title: "Latest", rootPath: "/home/" },
  { id: "pp", title: "Popular", rootPath: "/popular/" },
  { id: "tr", title: "Top Rated", rootPath: "/top-rated/" },
  { id: "dl", title: "Most Downloaded", rootPath: "/downloaded/" },
];

export const SORT_OPTIONS: LabeledOption[] = SORTS.map(({ id, title }) => ({
  id,
  title,
}));

export const FEEDS: { id: SortKey; title: string }[] = [
  { id: "lt", title: "Latest" },
  { id: "pp", title: "Popular" },
  { id: "tr", title: "Top Rated" },
  { id: "dl", title: "Most Downloaded" },
];

/** Item list keys with this prefix carry a search/tag query, e.g. `q:+tag:"big breasts"`. */
export const QUERY_LIST_PREFIX = "q:";

export type TitleDisplay = "full" | "clean" | "subtitle";

export const TITLE_DISPLAY_OPTIONS: LabeledOption[] = [
  { id: "full", title: "Full Title" },
  { id: "clean", title: "Short Title (Clean)" },
  { id: "subtitle", title: "Original / Japanese Title (when available)" },
];
