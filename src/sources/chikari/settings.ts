import {
  LabeledOption,
  UIForm,
  UIPicker,
  UISelect,
  UIToggle,
  UIView,
} from "@suwatte/toolchain";

import {
  CONTENT_RATING_OPTIONS,
  DEFAULT_CONTENT_TYPES,
  DEFAULT_MAX_CONTENT_RATING,
  GENRE_OPTIONS,
  PREF_CONTENT_TYPES,
  PREF_EXCLUDE_GENRES,
  PREF_EXCLUDED_TAGS,
  PREF_MAX_CONTENT_RATING,
  PREF_SHOW_18,
  TYPE_OPTIONS,
} from "./constants";
import { selectedIds } from "./utils";

export interface Preferences {
  showAdult: boolean;
  /** Highest rating tier requested; sent as `content_rating` like the website. */
  maxContentRating: string;
  /** Types requested via `type`; the default trio matches the website's default. */
  contentTypes: string[];
  /** Genre slugs hidden everywhere, like the site's `excluded_genres`. */
  excludedGenres: string[];
  /** Tag ids hidden everywhere, like the site's `excluded_tags`. */
  excludedTags: string[];
}

/** Content ratings up to and including the max; unknown values fall back to the site default. */
export function allowedContentRatings(maxContentRating: string): string[] {
  const ratings = CONTENT_RATING_OPTIONS.map((o) => o.id);
  const maxIndex = ratings.indexOf(maxContentRating);
  return maxIndex >= 0 ? ratings.slice(0, maxIndex + 1) : ratings.slice(0, 2);
}

/** Keeps ids present on the form, in option order; an empty selection falls back to the site default. */
function validSelection(value: string[] | null, options: { id: string }[], fallback: string[]): string[] {
  const order = options.map(({ id }) => id);
  const selected = new Set(value ?? []);
  const known = order.filter((id) => selected.has(id));
  return known.length > 0 ? known : fallback;
}

export async function loadPreferences(): Promise<Preferences> {
  const [showAdult, maxContentRating, contentTypes, excludedGenres, excludedTags] = await Promise.all([
    ObjectStore.boolean(PREF_SHOW_18),
    ObjectStore.string(PREF_MAX_CONTENT_RATING),
    ObjectStore.stringArray(PREF_CONTENT_TYPES),
    ObjectStore.stringArray(PREF_EXCLUDE_GENRES),
    ObjectStore.stringArray(PREF_EXCLUDED_TAGS),
  ]);

  const normalizedRating = maxContentRating?.toLowerCase();
  const knownRating = CONTENT_RATING_OPTIONS.some(({ id }) => id === normalizedRating);

  return {
    showAdult: showAdult ?? false,
    maxContentRating: knownRating ? (normalizedRating as string) : DEFAULT_MAX_CONTENT_RATING,
    contentTypes: validSelection(contentTypes, TYPE_OPTIONS, DEFAULT_CONTENT_TYPES),
    excludedGenres: excludedGenres ?? [],
    excludedTags: excludedTags ?? [],
  };
}

export function buildSettingsForm(prefs: Preferences, tagOptions: LabeledOption[] | null): UIForm {
  const contentViews: UIView[] = [
    UIToggle({
      id: PREF_SHOW_18,
      title: "Adult Mode (+18)",
      defaultValue: false,
      currentValue: prefs.showAdult,
    }),
    UISelect({
      id: PREF_EXCLUDE_GENRES,
      title: "Excluded Genres",
      options: GENRE_OPTIONS,
      exclude: false,
      defaultValue: { include: [], exclude: [] },
      currentValue: { include: prefs.excludedGenres, exclude: [] },
    }),
  ];
  if (tagOptions && tagOptions.length > 0) {
    contentViews.push(
      UISelect({
        id: PREF_EXCLUDED_TAGS,
        title: "Excluded Tags",
        options: tagOptions,
        exclude: false,
        defaultValue: { include: [], exclude: [] },
        currentValue: { include: prefs.excludedTags, exclude: [] },
      })
    );
  }

  return {
    sections: [
      {
        header: "Content Preferences",
        footer:
          "Adult Mode shows only 18+ titles. With it off, titles above the maximum content rating are hidden.",
        views: contentViews,
      },
      {
        header: "Advanced Settings",
        footer:
          "Content types and the content rating apply to both browse feeds and search. Filters chosen in a search override these defaults.",
        views: [
          UISelect({
            id: PREF_CONTENT_TYPES,
            title: "Content Types",
            options: TYPE_OPTIONS,
            exclude: false,
            defaultValue: { include: DEFAULT_CONTENT_TYPES, exclude: [] },
            currentValue: { include: prefs.contentTypes, exclude: [] },
          }),
          UIPicker({
            id: PREF_MAX_CONTENT_RATING,
            title: "Maximum Content Rating",
            options: CONTENT_RATING_OPTIONS,
            defaultValue: DEFAULT_MAX_CONTENT_RATING,
            currentValue: prefs.maxContentRating,
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
    typeof data[key] === "string" ? (data[key] as string).toLowerCase() : undefined;
  const selection = (key: string) =>
    data[key] && typeof data[key] === "object" ? selectedIds(data[key]) : undefined;

  const updates: [string, unknown][] = [
    [PREF_SHOW_18, boolean(PREF_SHOW_18)],
    [PREF_EXCLUDE_GENRES, selection(PREF_EXCLUDE_GENRES)],
    [PREF_EXCLUDED_TAGS, selection(PREF_EXCLUDED_TAGS)],
    [PREF_CONTENT_TYPES, selection(PREF_CONTENT_TYPES)],
    [PREF_MAX_CONTENT_RATING, string(PREF_MAX_CONTENT_RATING)],
  ];

  for (const [key, value] of updates) {
    if (value !== undefined) {
      await ObjectStore.set(key, value);
    }
  }
}
