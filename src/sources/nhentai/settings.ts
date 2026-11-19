import type { STTStore } from "@suwatte/toolchain";
import {
  LabeledOption,
  UIForm,
  UIPicker,
  UISelect,
  UITextField,
  UIToggle,
} from "@suwatte/toolchain";

import {
  HIDDEN_TAG_OPTIONS,
  PREF_API_KEY,
  PREF_CUSTOM_HIDDEN_TAGS,
  PREF_HIDDEN_TAGS,
  PREF_TITLE_DISPLAY,
  PREF_USE_ACCOUNT_BLACKLIST,
  SECURE_API_KEY,
  TITLE_DISPLAY_OPTIONS,
  TitleDisplay,
  humanizeHiddenTag,
} from "./constants";

/** Provided by the app and the emulator, but not declared by the toolchain typings. */
declare const SecureStore: STTStore;

export interface Preferences {
  /** Effective hidden tags: selectable entries plus free-form custom entries. */
  hiddenTags: string[];
  /** Free-form entries entered in the "Additional Hidden Tags" field. */
  customHiddenTags: string[];
  titleDisplay: TitleDisplay;
  apiKey: string | null;
  useAccountBlacklist: boolean;
}

const NAMESPACE_ALIASES: Record<string, string> = {
  female: "tag",
  male: "tag",
  tags: "tag",
  artists: "artist",
  groups: "group",
  parodies: "parody",
  series: "parody",
  characters: "character",
  categories: "category",
  type: "category",
  languages: "language",
};

export function normalizeHiddenTagEntry(raw: string): string {
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
    const ns = NAMESPACE_ALIASES[rawNs] ?? rawNs;
    const val = cleaned
      .slice(colon + 1)
      .trim()
      .replace(/^"|"$/g, "");
    if (!val) return "";
    return `${ns}:${val}`;
  }
  return cleaned;
}

export function parseHiddenTags(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map(normalizeHiddenTagEntry)
    .filter((t) => t.length > 0);
}

function parseTitleDisplay(value: string | null | undefined): TitleDisplay {
  if (value === "pretty" || value === "japanese") return value;
  return "english";
}

/** Reads the API key from the app's secure storage. */
export async function loadApiKey(): Promise<string | null> {
  const apiKey = await SecureStore.string(SECURE_API_KEY);
  return apiKey?.trim() || null;
}

/** Removes the stored API key. */
export async function clearApiKey(): Promise<void> {
  await SecureStore.remove(SECURE_API_KEY);
}

export async function loadPreferences(): Promise<Preferences> {
  const [hiddenTags, customHiddenTags, titleDisplay, apiKey, useAccountBlacklist] =
    await Promise.all([
      ObjectStore.string(PREF_HIDDEN_TAGS),
      ObjectStore.string(PREF_CUSTOM_HIDDEN_TAGS),
      ObjectStore.string(PREF_TITLE_DISPLAY),
      loadApiKey(),
      ObjectStore.boolean(PREF_USE_ACCOUNT_BLACKLIST),
    ]);

  const custom = parseHiddenTags(customHiddenTags);
  return {
    hiddenTags: Array.from(new Set([...parseHiddenTags(hiddenTags), ...custom])),
    customHiddenTags: custom,
    titleDisplay: parseTitleDisplay(titleDisplay),
    apiKey,
    useAccountBlacklist: useAccountBlacklist ?? true,
  };
}

/** Builds the selectable option list, including any tags seen while browsing. */
export function buildHiddenTagOptions(
  prefs: Preferences,
  discovered: LabeledOption[] = []
): LabeledOption[] {
  const titles = new Map<string, string>();
  for (const option of [...HIDDEN_TAG_OPTIONS, ...discovered]) {
    if (!titles.has(option.id)) titles.set(option.id, option.title);
  }
  for (const id of prefs.hiddenTags) {
    if (!titles.has(id)) titles.set(id, humanizeHiddenTag(id));
  }
  return Array.from(titles, ([id, title]) => ({ id, title })).sort((a, b) =>
    a.title.localeCompare(b.title)
  );
}

export function buildSettingsForm(
  prefs: Preferences,
  discoveredTags: LabeledOption[] = []
): UIForm {
  return {
    sections: [
      {
        header: "Content",
        footer:
          "Hidden tags apply to browse feeds and search. Pick tags from the list (which grows as you browse galleries), or enter any other tag below, e.g. artist:name, group:name, parody:name.",
        views: [
          UISelect({
            id: PREF_HIDDEN_TAGS,
            title: "Hidden Tags",
            options: buildHiddenTagOptions(prefs, discoveredTags),
            exclude: false,
            defaultValue: { include: [], exclude: [] },
            currentValue: { include: prefs.hiddenTags, exclude: [] },
          }),
          UITextField({
            id: PREF_CUSTOM_HIDDEN_TAGS,
            title: "Additional Hidden Tags",
            placeholder: "Comma-separated, e.g. guro, artist:crimson",
            defaultValue: "",
            currentValue: prefs.customHiddenTags.join(", "),
          }),
          UIPicker({
            id: PREF_TITLE_DISPLAY,
            title: "Title Display",
            options: TITLE_DISPLAY_OPTIONS,
            defaultValue: "english",
            currentValue: prefs.titleDisplay,
          }),
        ],
      },
      {
        header: "Account (Optional)",
        footer: prefs.apiKey
          ? "API key configured. Clear the API Key field and save to remove it."
          : "Generate an API key at nhentai.net/user/settings#apikeys for higher rate limits, the Favorites feed, and account blacklist support.",
        views: [
          UITextField({
            id: PREF_API_KEY,
            title: "API Key",
            placeholder: "Paste key from nhentai.net/user/settings#apikeys",
            isSecure: true,
            defaultValue: "",
            currentValue: prefs.apiKey ?? "",
          }),
          UIToggle({
            id: PREF_USE_ACCOUNT_BLACKLIST,
            title: "Hide Account Blacklisted Galleries",
            defaultValue: true,
            currentValue: prefs.useAccountBlacklist,
          }),
        ],
      },
    ],
  };
}

export async function savePreferences(data: Record<string, unknown>): Promise<void> {
  const hiddenTags = data[PREF_HIDDEN_TAGS];
  if (hiddenTags && typeof hiddenTags === "object") {
    const include = (hiddenTags as { include?: string[] }).include;
    if (Array.isArray(include)) {
      await ObjectStore.set(PREF_HIDDEN_TAGS, include.join(", "));
    }
  } else if (typeof hiddenTags === "string") {
    // Older settings forms submitted a comma-separated string.
    await ObjectStore.set(PREF_HIDDEN_TAGS, hiddenTags);
  }
  if (typeof data[PREF_CUSTOM_HIDDEN_TAGS] === "string") {
    await ObjectStore.set(PREF_CUSTOM_HIDDEN_TAGS, data[PREF_CUSTOM_HIDDEN_TAGS]);
  }
  const titleDisplay = data[PREF_TITLE_DISPLAY];
  if (
    titleDisplay === "english" ||
    titleDisplay === "pretty" ||
    titleDisplay === "japanese"
  ) {
    await ObjectStore.set(PREF_TITLE_DISPLAY, titleDisplay);
  }
  if (typeof data[PREF_API_KEY] === "string") {
    const trimmed = data[PREF_API_KEY].trim().replace(/^Key\s+/i, "").trim();
    if (trimmed) {
      await SecureStore.set(SECURE_API_KEY, trimmed);
    } else {
      await SecureStore.remove(SECURE_API_KEY);
    }
  }
  if (typeof data[PREF_USE_ACCOUNT_BLACKLIST] === "boolean") {
    await ObjectStore.set(
      PREF_USE_ACCOUNT_BLACKLIST,
      data[PREF_USE_ACCOUNT_BLACKLIST]
    );
  }
}
