import { LabeledOption, SourceConfiguration } from "@suwatte/toolchain";

export const EH_BASE_URL = "https://e-hentai.org";
// export const EX_BASE_URL = "https://exhentai.org";
export const API_URL = "https://api.e-hentai.org/api.php";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const SOURCE_CONFIG: SourceConfiguration = {
  imageReferer: `${EH_BASE_URL}/`,
  useClientForImageRequests: true,
};

/** Resolved H@H image URLs carry a short-lived keystamp; cache briefly. */
export const IMAGE_URL_TTL_MS = 3 * 60 * 1000;
export const GALLERY_CACHE_TTL_MS = 5 * 60 * 1000;

export const PREF_HIDDEN_TAGS = "pref_hidden_tags";
export const PREF_EXCLUDED_CATEGORIES = "pref_excluded_categories";
export const PREF_TITLE_DISPLAY = "pref_title_display";
// TODO: Revisit account & ExHentai support later
// export const PREF_ORIGINAL_IMAGES = "pref_original_images";
// export const PREF_USE_EXHENTAI = "pref_use_exhentai";
// export const PREF_MEMBER_ID = "pref_ipb_member_id";
// export const PREF_PASS_HASH = "pref_ipb_pass_hash";
// export const PREF_IGNEOUS = "pref_igneous";

// export const SECURE_MEMBER_ID = "eh_ipb_member_id";
// export const SECURE_PASS_HASH = "eh_ipb_pass_hash";
// export const SECURE_IGNEOUS = "eh_igneous";

/** E-Hentai language tag names and their BCP 47 codes. */
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
  if (!name) return undefined;
  const clean = name.replace(/\btr$/i, "").trim().toLowerCase();
  if (clean === "speechless" || clean === "text Cleaned") return "zxx";
  return LANGUAGES.find((l) => l.name === clean)?.code;
}

export function languageTitle(name?: string | null): string | undefined {
  if (!name) return undefined;
  const clean = name.trim().toLowerCase();
  if (clean === "speechless") return "Speechless";
  if (clean === "translated" || clean === "rewrite") return undefined;
  return (
    LANGUAGES.find((l) => l.name === clean)?.title ??
    name.replace(/\b\w/g, (c) => c.toUpperCase())
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
  /** Bit value in E-Hentai's `f_cats` exclusion bitmask. */
  bit: number;
}

export const CATEGORIES: CategoryDefinition[] = [
  { id: "doujinshi", title: "Doujinshi", bit: 2 },
  { id: "manga", title: "Manga", bit: 4 },
  { id: "artistcg", title: "Artist CG", bit: 8 },
  { id: "gamecg", title: "Game CG", bit: 16 },
  { id: "western", title: "Western", bit: 512 },
  { id: "non-h", title: "Non-H", bit: 256 },
  { id: "imageset", title: "Image Set", bit: 32 },
  { id: "cosplay", title: "Cosplay", bit: 64 },
  { id: "asianporn", title: "Asian Porn", bit: 128 },
  { id: "misc", title: "Misc", bit: 1 },
];

export const ALL_CATEGORIES_MASK = 1023;

export const CATEGORY_OPTIONS: LabeledOption[] = CATEGORIES.map(({ id, title }) => ({
  id,
  title,
}));

export function normalizeCategoryId(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const slug = raw.toLowerCase().replace(/\s+/g, "");
  return CATEGORIES.find((c) => c.id === slug)?.id;
}

export function categoryTitle(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const id = normalizeCategoryId(raw);
  return CATEGORIES.find((c) => c.id === id)?.title ?? raw.trim();
}

export const MIN_RATING_ANY = "0";

export const MIN_RATING_OPTIONS: LabeledOption[] = [
  { id: MIN_RATING_ANY, title: "Any Rating" },
  { id: "2", title: "2+ Stars" },
  { id: "3", title: "3+ Stars" },
  { id: "4", title: "4+ Stars" },
  { id: "5", title: "5 Stars" },
];

/** Global feeds for the All-Languages variant (includes site-wide popular & toplists). */
export const ALL_VARIANT_FEEDS: { id: string; title: string; tl?: number }[] = [
  { id: "latest", title: "Latest" },
  { id: "popular", title: "Popular Right Now" },
  { id: "top_day", title: "Top Yesterday", tl: 15 },
  { id: "top_month", title: "Top Past Month", tl: 13 },
  { id: "top_year", title: "Top Past Year", tl: 12 },
  { id: "top_all", title: "Top All-Time", tl: 11 },
];

/** Language-scoped feeds for single-language variants (`/popular` & `toplist.php` ignore language filters). */
export const LANG_VARIANT_FEEDS: { id: string; title: string }[] = [
  { id: "latest", title: "Latest" },
  { id: "rated_4", title: "Rated 4+ Stars" },
  { id: "doujinshi", title: "Doujinshi" },
  { id: "manga", title: "Manga" },
];

// export const ACCOUNT_FEEDS: { id: string; title: string }[] = [
//   { id: "watched", title: "Watched" },
//   { id: "favorites", title: "Favorites" },
// ];

export const QUERY_LIST_PREFIX = "q:";

export type TitleDisplay = "default" | "japanese" | "clean";

export const TITLE_DISPLAY_OPTIONS: LabeledOption[] = [
  { id: "default", title: "Default (English / Romaji)" },
  { id: "japanese", title: "Japanese Title (when available)" },
  { id: "clean", title: "Short Title (Clean)" },
];
