import {
  UIForm,
  UIPicker,
  UISelect,
  UITextField,
} from "@suwatte/toolchain";

import {
  CATEGORY_OPTIONS,
  PREF_EXCLUDED_CATEGORIES,
  PREF_HIDDEN_TAGS,
  PREF_TITLE_DISPLAY,
  TITLE_DISPLAY_OPTIONS,
  TitleDisplay,
} from "./constants";

export interface Preferences {
  /** Lowercased hidden tag terms, e.g. `yaoi`, `futanari`, `artist:name`. */
  hiddenTags: string[];
  excludedCategories: string[];
  titleDisplay: TitleDisplay;
}

const NAMESPACE_ALIASES: Record<string, string> = {
  tag: "tag",
  tags: "tag",
  female: "tag",
  male: "tag",
  artist: "artist",
  artists: "artist",
  group: "group",
  groups: "group",
  circle: "group",
  parody: "parody",
  parodies: "parody",
  series: "parody",
  character: "character",
  characters: "character",
};

export function normalizeHiddenTag(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^[-+]+/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^"|"$/g, "");
  if (!cleaned) return "";
  const colon = cleaned.indexOf(":");
  if (colon > 0) {
    const rawNs = cleaned.slice(0, colon).trim();
    const ns = NAMESPACE_ALIASES[rawNs] ?? "tag";
    const val = cleaned
      .slice(colon + 1)
      .trim()
      .replace(/^"|"$/g, "");
    if (!val) return "";
    return ns === "tag" ? val : `${ns}:${val}`;
  }
  return cleaned;
}

export function parseHiddenTags(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map(normalizeHiddenTag)
    .filter((t) => t.length > 0);
}

function parseTitleDisplay(value: string | null | undefined): TitleDisplay {
  if (value === "clean" || value === "subtitle") return value;
  return "full";
}

export async function loadPreferences(): Promise<Preferences> {
  const [hiddenTags, excludedCategories, titleDisplay] = await Promise.all([
    ObjectStore.string(PREF_HIDDEN_TAGS),
    ObjectStore.stringArray(PREF_EXCLUDED_CATEGORIES),
    ObjectStore.string(PREF_TITLE_DISPLAY),
  ]);

  return {
    hiddenTags: parseHiddenTags(hiddenTags),
    excludedCategories: excludedCategories ?? [],
    titleDisplay: parseTitleDisplay(titleDisplay),
  };
}

export function buildSettingsForm(prefs: Preferences): UIForm {
  return {
    sections: [
      {
        header: "Content",
        footer:
          "Hidden tags apply to browse feeds and advanced searches. Enter tag names like yaoi, futanari, guro or namespaced entries like artist:name, group:name, parody:name.",
        views: [
          UITextField({
            id: PREF_HIDDEN_TAGS,
            title: "Hidden Tags",
            placeholder: "Comma-separated, e.g. yaoi, futanari, guro",
            defaultValue: "",
            currentValue: prefs.hiddenTags.join(", "),
          }),
          UISelect({
            id: PREF_EXCLUDED_CATEGORIES,
            title: "Excluded Categories",
            options: CATEGORY_OPTIONS,
            exclude: false,
            defaultValue: { include: [], exclude: [] },
            currentValue: { include: prefs.excludedCategories, exclude: [] },
          }),
          UIPicker({
            id: PREF_TITLE_DISPLAY,
            title: "Title Display",
            options: TITLE_DISPLAY_OPTIONS,
            defaultValue: "full",
            currentValue: prefs.titleDisplay,
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
  const excluded = data[PREF_EXCLUDED_CATEGORIES] as
    | { include?: string[] }
    | undefined;
  if (excluded && Array.isArray(excluded.include)) {
    await ObjectStore.set(PREF_EXCLUDED_CATEGORIES, excluded.include);
  }
  const titleDisplay = data[PREF_TITLE_DISPLAY];
  if (
    titleDisplay === "full" ||
    titleDisplay === "clean" ||
    titleDisplay === "subtitle"
  ) {
    await ObjectStore.set(PREF_TITLE_DISPLAY, titleDisplay);
  }
}
