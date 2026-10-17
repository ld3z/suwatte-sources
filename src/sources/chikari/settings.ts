import { UIForm, UISelect, UIToggle } from "@suwatte/toolchain";

import {
  DEFAULT_CONTENT_TYPES,
  GENRE_OPTIONS,
  PREF_CONTENT_TYPES,
  PREF_EXCLUDE_GENRES,
  PREF_SHOW_18,
  TYPE_OPTIONS,
} from "./constants";
import { selectedIds } from "./utils";

export interface Preferences {
  showAdult: boolean;
  /** Genre slugs hidden from browse feeds and search. */
  excludedGenres: string[];
  /** Comic types shown in browse feeds and search (unless a search picks its own). */
  contentTypes: string[];
}

export async function loadPreferences(): Promise<Preferences> {
  const [showAdult, excludedGenres, contentTypes] = await Promise.all([
    ObjectStore.boolean(PREF_SHOW_18),
    ObjectStore.stringArray(PREF_EXCLUDE_GENRES),
    ObjectStore.stringArray(PREF_CONTENT_TYPES),
  ]);

  return {
    showAdult: showAdult ?? false,
    excludedGenres: excludedGenres ?? [],
    contentTypes:
      contentTypes && contentTypes.length > 0 ? contentTypes : DEFAULT_CONTENT_TYPES,
  };
}

export function buildSettingsForm(prefs: Preferences): UIForm {
  return {
    sections: [
      {
        header: "Content Preferences",
        footer:
          "Adult Mode shows only 18+ titles. Turn it off to see non-adult titles. Content types and excluded genres apply to browse feeds and search; a search's own type filter overrides the content types.",
        views: [
          UIToggle({
            id: PREF_SHOW_18,
            title: "Adult Mode (+18)",
            defaultValue: false,
            currentValue: prefs.showAdult,
          }),
          UISelect({
            id: PREF_CONTENT_TYPES,
            title: "Content Types",
            options: TYPE_OPTIONS,
            exclude: false,
            defaultValue: { include: DEFAULT_CONTENT_TYPES, exclude: [] },
            currentValue: { include: prefs.contentTypes, exclude: [] },
          }),
          UISelect({
            id: PREF_EXCLUDE_GENRES,
            title: "Exclude Genres",
            options: GENRE_OPTIONS,
            exclude: false,
            defaultValue: { include: [], exclude: [] },
            currentValue: { include: prefs.excludedGenres, exclude: [] },
          }),
        ],
      },
    ],
  };
}

/** Saves each submitted value that has the expected type; others are ignored. */
export async function savePreferences(data: Record<string, unknown>): Promise<void> {
  if (typeof data[PREF_SHOW_18] === "boolean") {
    await ObjectStore.set(PREF_SHOW_18, data[PREF_SHOW_18]);
  }
  if (data[PREF_EXCLUDE_GENRES] && typeof data[PREF_EXCLUDE_GENRES] === "object") {
    await ObjectStore.set(PREF_EXCLUDE_GENRES, selectedIds(data[PREF_EXCLUDE_GENRES]));
  }
  if (data[PREF_CONTENT_TYPES] && typeof data[PREF_CONTENT_TYPES] === "object") {
    await ObjectStore.set(PREF_CONTENT_TYPES, selectedIds(data[PREF_CONTENT_TYPES]));
  }
}
