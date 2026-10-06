import {
  UIForm,
  UIPicker,
  UISelect,
  UIStepper,
  UITextField,
  UIToggle,
} from "@suwatte/toolchain";

import {
  CONTENT_RATING_OPTIONS,
  DEFAULT_CONTENT_TYPES,
  DEFAULT_MAX_CONTENT_RATING,
  GENRE_OPTIONS,
  PREF_CONTENT_TYPES,
  PREF_EXCLUDE_GENRES,
  PREF_EXCLUDE_GENRES_IN_SEARCH,
  PREF_HIDDEN_KEYWORDS,
  PREF_MAX_CONTENT_RATING,
  PREF_MIN_CHAPTERS,
  PREF_OFFICIAL_ONLY,
  PREF_SHOW_18,
  TYPE_OPTIONS,
} from "./constants";
import { selectedIds } from "./utils";

export interface Preferences {
  showAdult: boolean;
  /** Genre ids hidden from browse feeds (and from search when `excludeGenresInSearch` is on). */
  excludedGenres: string[];
  excludeGenresInSearch: boolean;
  /** null means the user hasn't picked any types. */
  contentTypes: string[] | null;
  maxContentRating: string;
  minChapters: number;
  officialOnly: boolean;
  /** Lowercased, trimmed, non-empty keywords. */
  hiddenKeywords: string[];
}

export async function loadPreferences(): Promise<Preferences> {
  const [
    showAdult,
    excludedGenres,
    excludeGenresInSearch,
    contentTypes,
    maxContentRating,
    minChapters,
    officialOnly,
    hiddenKeywords,
  ] = await Promise.all([
    ObjectStore.boolean(PREF_SHOW_18),
    ObjectStore.stringArray(PREF_EXCLUDE_GENRES),
    ObjectStore.boolean(PREF_EXCLUDE_GENRES_IN_SEARCH),
    ObjectStore.stringArray(PREF_CONTENT_TYPES),
    ObjectStore.string(PREF_MAX_CONTENT_RATING),
    ObjectStore.number(PREF_MIN_CHAPTERS),
    ObjectStore.boolean(PREF_OFFICIAL_ONLY),
    ObjectStore.string(PREF_HIDDEN_KEYWORDS),
  ]);

  return {
    showAdult: showAdult ?? false,
    excludedGenres: excludedGenres ?? [],
    excludeGenresInSearch: excludeGenresInSearch ?? false,
    contentTypes: contentTypes && contentTypes.length > 0 ? contentTypes : null,
    maxContentRating: maxContentRating ?? DEFAULT_MAX_CONTENT_RATING,
    minChapters: minChapters ?? 0,
    officialOnly: officialOnly ?? false,
    hiddenKeywords: (hiddenKeywords ?? "")
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0),
  };
}

/** Content ratings up to and including the max; unknown values allow all. */
export function allowedContentRatings(maxContentRating: string): string[] {
  const ratings = CONTENT_RATING_OPTIONS.map((o) => o.id);
  const maxIndex = ratings.indexOf(maxContentRating);
  return maxIndex >= 0 ? ratings.slice(0, maxIndex + 1) : ratings;
}

export function buildSettingsForm(prefs: Preferences): UIForm {
  return {
    sections: [
      {
        header: "Content Preferences",
        footer:
          "Adult Mode shows only 18+ titles. With it off, 18+ titles are hidden unless the maximum content rating is Pornographic.",
        views: [
          UIToggle({
            id: PREF_SHOW_18,
            title: "Adult Mode (+18)",
            defaultValue: false,
            currentValue: prefs.showAdult,
          }),
          UISelect({
            id: PREF_EXCLUDE_GENRES,
            title: "Exclude Genres from Browse",
            options: GENRE_OPTIONS,
            exclude: false,
            defaultValue: { include: [], exclude: [] },
            currentValue: { include: prefs.excludedGenres, exclude: [] },
          }),
        ],
      },
      {
        header: "Advanced Settings",
        footer:
          "Content types, minimum chapters, and hidden keywords apply to both browse feeds and search. Content rating and official-only apply to search. Filters chosen in a search override these defaults.",
        views: [
          UISelect({
            id: PREF_CONTENT_TYPES,
            title: "Content Types",
            options: TYPE_OPTIONS,
            exclude: false,
            defaultValue: { include: DEFAULT_CONTENT_TYPES, exclude: [] },
            currentValue: {
              include: prefs.contentTypes ?? DEFAULT_CONTENT_TYPES,
              exclude: [],
            },
          }),
          UIPicker({
            id: PREF_MAX_CONTENT_RATING,
            title: "Maximum Content Rating",
            options: CONTENT_RATING_OPTIONS,
            defaultValue: DEFAULT_MAX_CONTENT_RATING,
            currentValue: prefs.maxContentRating,
          }),
          UIStepper({
            id: PREF_MIN_CHAPTERS,
            title: "Minimum Chapters",
            lowerBound: 0,
            upperBound: 1000,
            step: 5,
            defaultValue: 0,
            currentValue: prefs.minChapters,
          }),
          UIToggle({
            id: PREF_OFFICIAL_ONLY,
            title: "Only Official Translations",
            defaultValue: false,
            currentValue: prefs.officialOnly,
          }),
          UIToggle({
            id: PREF_EXCLUDE_GENRES_IN_SEARCH,
            title: "Apply Excluded Genres to Search",
            defaultValue: false,
            currentValue: prefs.excludeGenresInSearch,
          }),
          UITextField({
            id: PREF_HIDDEN_KEYWORDS,
            title: "Hide Titles Containing",
            placeholder: "Comma-separated, e.g. isekai, reincarnated",
            defaultValue: "",
            currentValue: prefs.hiddenKeywords.join(", "),
          }),
        ],
      },
    ],
  };
}

/** Saves each submitted value that has the expected type; others are ignored. */
export async function savePreferences(data: Record<string, unknown>): Promise<void> {
  const boolean = (key: string) =>
    typeof data[key] === "boolean" ? (data[key] as boolean) : undefined;
  const string = (key: string) =>
    typeof data[key] === "string" ? (data[key] as string) : undefined;
  const selection = (key: string) =>
    data[key] && typeof data[key] === "object" ? selectedIds(data[key]) : undefined;
  const wholeNumber = (key: string) =>
    typeof data[key] === "number"
      ? Math.max(0, Math.floor(data[key] as number))
      : undefined;

  const updates: [string, unknown][] = [
    [PREF_SHOW_18, boolean(PREF_SHOW_18)],
    [PREF_EXCLUDE_GENRES, selection(PREF_EXCLUDE_GENRES)],
    [PREF_CONTENT_TYPES, selection(PREF_CONTENT_TYPES)],
    [PREF_MAX_CONTENT_RATING, string(PREF_MAX_CONTENT_RATING)],
    [PREF_MIN_CHAPTERS, wholeNumber(PREF_MIN_CHAPTERS)],
    [PREF_OFFICIAL_ONLY, boolean(PREF_OFFICIAL_ONLY)],
    [PREF_EXCLUDE_GENRES_IN_SEARCH, boolean(PREF_EXCLUDE_GENRES_IN_SEARCH)],
    [PREF_HIDDEN_KEYWORDS, string(PREF_HIDDEN_KEYWORDS)],
  ];

  for (const [key, value] of updates) {
    if (value !== undefined) {
      await ObjectStore.set(key, value);
    }
  }
}
