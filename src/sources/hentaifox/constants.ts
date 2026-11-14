import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://hentaifox.com";
export const HOME_URL = `${BASE_URL}/`;

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
  title: string;
  /** Numeric ID used in listing `data-languages` attributes. */
  dataId?: string;
}

/** Languages exposed as dedicated catalog variants (mirrors Keiyoushi). */
export const LANGUAGES: LanguageDefinition[] = [
  { name: "english", code: "en", title: "English", dataId: "1" },
  { name: "japanese", code: "ja", title: "Japanese", dataId: "5" },
  { name: "chinese", code: "zh", title: "Chinese", dataId: "6" },
  { name: "korean", code: "ko", title: "Korean", dataId: "11" },
];

/** Additional rare/meta language slugs present on gallery pages. */
export const EXTRA_LANGUAGES: {
  name: string;
  code?: string;
  title?: string;
  dataId?: string;
}[] = [
  { name: "translated", dataId: "2" },
  { name: "speechless", code: "zxx", title: "Speechless", dataId: "8" },
  { name: "spanish", code: "es", title: "Spanish", dataId: "4" },
  { name: "french", code: "fr", title: "French" },
  { name: "german", code: "de", title: "German" },
  { name: "russian", code: "ru", title: "Russian" },
  { name: "portuguese", code: "pt", title: "Portuguese" },
  { name: "thai", code: "th", title: "Thai" },
  { name: "indonesian", code: "id", title: "Indonesian" },
  { name: "italian", code: "it", title: "Italian" },
  { name: "vietnamese", code: "vi", title: "Vietnamese" },
  { name: "rewrite" },
  { name: "text-cleaned", code: "zxx", title: "Text Cleaned" },
  { name: "textless-narrative", code: "zxx", title: "Textless" },
];

export const ALL_LANGUAGES = "all";

export function languageByName(
  name?: string | null
): LanguageDefinition | undefined {
  if (!name) return undefined;
  const lower = name.trim().toLowerCase();
  return LANGUAGES.find((l) => l.name === lower || l.code === lower);
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
  if (lower === "translated" || lower === "rewrite") return undefined;
  return (
    LANGUAGES.find((l) => l.name === lower)?.title ??
    EXTRA_LANGUAGES.find((l) => l.name === lower)?.title ??
    name.replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function languageDataId(name?: string | null): string | undefined {
  if (!name) return undefined;
  const lower = name.trim().toLowerCase();
  return (
    LANGUAGES.find((l) => l.name === lower)?.dataId ??
    EXTRA_LANGUAGES.find((l) => l.name === lower)?.dataId
  );
}

export const LANGUAGE_OPTIONS: LabeledOption[] = [
  { id: ALL_LANGUAGES, title: "All Languages" },
  ...LANGUAGES.map((l) => ({ id: l.name, title: l.title })),
  { id: "speechless", title: "Speechless" },
];

export interface CategoryDefinition {
  id: string;
  title: string;
  dataId?: string;
}

export const CATEGORIES: CategoryDefinition[] = [
  { id: "doujinshi", title: "Doujinshi", dataId: "1" },
  { id: "manga", title: "Manga", dataId: "2" },
  { id: "western", title: "Western", dataId: "3" },
  { id: "artist-cg", title: "Artist CG", dataId: "6" },
  { id: "image-set", title: "Image Set" },
  { id: "misc", title: "Misc" },
  { id: "non-h", title: "Non-H" },
];

export const CATEGORY_OPTIONS: LabeledOption[] = CATEGORIES.map(
  ({ id, title }) => ({ id, title })
);

export function normalizeCategoryId(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return (
    CATEGORIES.find((c) => c.id === slug)?.id ??
    CATEGORIES.find(
      (c) => c.id.replace(/-/g, "") === slug.replace(/-/g, "")
    )?.id
  );
}

export function categoryTitle(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const id = normalizeCategoryId(raw);
  return CATEGORIES.find((c) => c.id === id)?.title ?? raw.trim();
}

export type SortKey = "lt" | "pp" | "tr" | "mf" | "md" | "mp";

export const SORTS: {
  id: SortKey;
  title: string;
  /** Paginated browse path when no search/filters are active. */
  browse?: "latest" | "popular";
  /** Sidebar AJAX type for single-page ranking feeds. */
  sidebar?: string;
}[] = [
  { id: "lt", title: "Latest", browse: "latest" },
  { id: "pp", title: "Popular", browse: "popular" },
  { id: "tr", title: "Top Rated", sidebar: "top_rated" },
  { id: "mf", title: "Most Faved", sidebar: "top_faved" },
  { id: "mp", title: "Most Fapped", sidebar: "top_fapped" },
  { id: "md", title: "Most Downloaded", sidebar: "top_downloaded" },
];

export const SORT_OPTIONS: LabeledOption[] = SORTS.map(({ id, title }) => ({
  id,
  title,
}));

export const FEEDS: { id: SortKey; title: string }[] = [
  { id: "lt", title: "Latest" },
  { id: "pp", title: "Popular" },
  { id: "tr", title: "Top Rated" },
  { id: "mf", title: "Most Faved" },
  { id: "md", title: "Most Downloaded" },
];

/** Item list keys with this prefix carry a search/tag query, e.g. `q:+tag:"big breasts"`. */
export const QUERY_LIST_PREFIX = "q:";

export type TitleDisplay = "full" | "clean";

export const TITLE_DISPLAY_OPTIONS: LabeledOption[] = [
  { id: "full", title: "Full Title" },
  { id: "clean", title: "Short Title (Clean)" },
];
