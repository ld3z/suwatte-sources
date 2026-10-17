import { UIForm, UISelect, UIToggle } from "@suwatte/toolchain";

import { GENRE_OPTIONS, PREF_EXCLUDE_GENRES, PREF_SHOW_18 } from "./constants";
import { selectedIds } from "./utils";

export interface Preferences {
  showAdult: boolean;
  /** Genre slugs hidden from browse feeds and search. */
  excludedGenres: string[];
}

export async function loadPreferences(): Promise<Preferences> {
  const [showAdult, excludedGenres] = await Promise.all([
    ObjectStore.boolean(PREF_SHOW_18),
    ObjectStore.stringArray(PREF_EXCLUDE_GENRES),
  ]);

  return {
    showAdult: showAdult ?? false,
    excludedGenres: excludedGenres ?? [],
  };
}

export function buildSettingsForm(prefs: Preferences): UIForm {
  return {
    sections: [
      {
        header: "Content Preferences",
        footer:
          "Adult Mode shows only 18+ titles. Turn it off to see non-adult titles. Excluded genres apply to browse feeds and search.",
        views: [
          UIToggle({
            id: PREF_SHOW_18,
            title: "Adult Mode (+18)",
            defaultValue: false,
            currentValue: prefs.showAdult,
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
}
