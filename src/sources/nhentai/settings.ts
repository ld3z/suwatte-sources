import type { STTStore } from "@suwatte/toolchain";
import { UIForm, UIPicker, UITextField, UIToggle } from "@suwatte/toolchain";

import {
  PREF_API_KEY,
  PREF_HIDDEN_TAGS,
  PREF_TITLE_DISPLAY,
  PREF_USE_ACCOUNT_BLACKLIST,
  SECURE_API_KEY,
  TITLE_DISPLAY_OPTIONS,
  TitleDisplay,
} from "./constants";

declare const SecureStore: STTStore;

export interface Preferences {
  /** Lowercased hidden tag terms, e.g. `yaoi`, `big breasts`, `artist:crimson`. */
  hiddenTags: string[];
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

export async function loadPreferences(): Promise<Preferences> {
  const [hiddenTags, titleDisplay, apiKey, useAccountBlacklist] = await Promise.all([
    ObjectStore.string(PREF_HIDDEN_TAGS),
    ObjectStore.string(PREF_TITLE_DISPLAY),
    SecureStore.string(SECURE_API_KEY),
    ObjectStore.boolean(PREF_USE_ACCOUNT_BLACKLIST),
  ]);
  const trimmedKey = apiKey?.trim() || null;
  return {
    hiddenTags: parseHiddenTags(hiddenTags),
    titleDisplay: parseTitleDisplay(titleDisplay),
    apiKey: trimmedKey,
    useAccountBlacklist: useAccountBlacklist ?? true,
  };
}

export function buildSettingsForm(prefs: Preferences): UIForm {
  return {
    sections: [
      {
        header: "Content",
        footer:
          "Hidden tags apply to browse feeds and search. Enter tag names like yaoi, futanari, netorare or namespaced entries like artist:name, group:name, parody:name.",
        views: [
          UITextField({
            id: PREF_HIDDEN_TAGS,
            title: "Hidden Tags",
            placeholder: "Comma-separated, e.g. yaoi, futanari, guro",
            defaultValue: "",
            currentValue: prefs.hiddenTags.join(", "),
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
  if (typeof data[PREF_HIDDEN_TAGS] === "string") {
    await ObjectStore.set(PREF_HIDDEN_TAGS, data[PREF_HIDDEN_TAGS]);
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
