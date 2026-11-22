import { UIForm, UIPicker, UITextField, UIToggle } from "@suwatte/toolchain";

import {
  IMAGE_FORMAT_OPTIONS,
  PREF_HIDDEN_TAGS,
  PREF_HIDE_ANIME,
  PREF_IMAGE_FORMAT,
  PREF_SHOW_TAGS,
} from "./constants";

export interface Preferences {
  /** Lowercased keys matched against `galleryKeys`, e.g. `female:futanari` or `yaoi`. */
  hiddenTags: string[];
  /** When non-empty, only galleries matching one of these keys are shown. */
  showTags: string[];
  /** Anime galleries are videos; the reader only gets their preview stills. */
  hideAnime: boolean;
  imageFormat: "webp" | "avif";
}

export function parseHiddenTags(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/_/g, " ").replace(/\s*:\s*/, ":"))
    .filter((t) => t.length > 0);
}

export async function loadPreferences(): Promise<Preferences> {
  const [hiddenTags, showTags, hideAnime, imageFormat] = await Promise.all([
    ObjectStore.string(PREF_HIDDEN_TAGS),
    ObjectStore.string(PREF_SHOW_TAGS),
    ObjectStore.boolean(PREF_HIDE_ANIME),
    ObjectStore.string(PREF_IMAGE_FORMAT),
  ]);
  return {
    hiddenTags: parseHiddenTags(hiddenTags),
    showTags: parseHiddenTags(showTags),
    hideAnime: hideAnime ?? true,
    imageFormat: imageFormat === "avif" ? "avif" : "webp",
  };
}

export function buildSettingsForm(prefs: Preferences): UIForm {
  return {
    sections: [
      {
        header: "Content",
        footer:
          "Hidden tags apply to browse feeds and search. Show tags, when set, limit results to galleries carrying at least one listed tag; hidden tags still remove matches. Use namespaced tags like female:futanari, male:yaoi, artist:name or type:gamecg; a bare tag matches any namespace.",
        views: [
          UITextField({
            id: PREF_HIDDEN_TAGS,
            title: "Hidden Tags",
            placeholder: "Comma-separated, e.g. female:futanari, guro",
            defaultValue: "",
            currentValue: prefs.hiddenTags.join(", "),
          }),
          UITextField({
            id: PREF_SHOW_TAGS,
            title: "Show Tags",
            placeholder: "Comma-separated, e.g. full color, artist:shindol",
            defaultValue: "",
            currentValue: prefs.showTags.join(", "),
          }),
          UIToggle({
            id: PREF_HIDE_ANIME,
            title: "Hide Anime (Video) Galleries",
            defaultValue: true,
            currentValue: prefs.hideAnime,
          }),
        ],
      },
      {
        header: "Reader",
        footer: "AVIF pages are smaller but need iOS 16 or newer. Galleries without AVIF fall back to WebP.",
        views: [
          UIPicker({
            id: PREF_IMAGE_FORMAT,
            title: "Image Format",
            options: IMAGE_FORMAT_OPTIONS,
            defaultValue: "webp",
            currentValue: prefs.imageFormat,
          }),
        ],
      },
    ],
  };
}

export async function savePreferences(data: Record<string, unknown>): Promise<void> {
  if (typeof data[PREF_HIDDEN_TAGS] === "string") {
    await ObjectStore.set(PREF_HIDDEN_TAGS, data[PREF_HIDDEN_TAGS]);
  }
  if (typeof data[PREF_SHOW_TAGS] === "string") {
    await ObjectStore.set(PREF_SHOW_TAGS, data[PREF_SHOW_TAGS]);
  }
  if (typeof data[PREF_HIDE_ANIME] === "boolean") {
    await ObjectStore.set(PREF_HIDE_ANIME, data[PREF_HIDE_ANIME]);
  }
  const format = data[PREF_IMAGE_FORMAT];
  if (format === "webp" || format === "avif") {
    await ObjectStore.set(PREF_IMAGE_FORMAT, format);
  }
}
