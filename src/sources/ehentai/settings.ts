// import type { STTStore } from "@suwatte/toolchain";
import {
  UIForm,
  UIPicker,
  UISelect,
  UITextField,
  // UIToggle,
} from "@suwatte/toolchain";

import {
  CATEGORY_OPTIONS,
  EH_BASE_URL,
  // EX_BASE_URL,
  PREF_EXCLUDED_CATEGORIES,
  PREF_HIDDEN_TAGS,
  // PREF_IGNEOUS,
  // PREF_MEMBER_ID,
  // PREF_ORIGINAL_IMAGES,
  // PREF_PASS_HASH,
  PREF_TITLE_DISPLAY,
  // PREF_USE_EXHENTAI,
  // SECURE_IGNEOUS,
  // SECURE_MEMBER_ID,
  // SECURE_PASS_HASH,
  TITLE_DISPLAY_OPTIONS,
  TitleDisplay,
} from "./constants";

// declare const SecureStore: STTStore;

// export interface AccountCookies {
//   memberId: string;
//   passHash: string;
//   igneous?: string;
// }

export interface Preferences {
  /** Lowercased hidden tag terms, e.g. `male:yaoi`, `female:futanari`, `guro`. */
  hiddenTags: string[];
  excludedCategories: string[];
  titleDisplay: TitleDisplay;
  // TODO: Revisit account & ExHentai support later
  // originalImages: boolean;
  // useExHentai: boolean;
  // account: AccountCookies | null;
}

const NAMESPACE_ALIASES: Record<string, string> = {
  f: "female",
  m: "male",
  x: "mixed",
  o: "other",
  p: "parody",
  series: "parody",
  c: "character",
  g: "group",
  a: "artist",
  cos: "cosplayer",
  l: "language",
  r: "reclass",
};

export function normalizeHiddenTag(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^[-+]+/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^"|"$/g, "")
    .replace(/\$$/, "");
  if (!cleaned) return "";
  const colon = cleaned.indexOf(":");
  if (colon > 0) {
    const rawNs = cleaned.slice(0, colon).trim();
    const ns = NAMESPACE_ALIASES[rawNs] ?? rawNs;
    const val = cleaned
      .slice(colon + 1)
      .trim()
      .replace(/^"|"$/g, "")
      .replace(/\$$/, "");
    return val ? `${ns}:${val}` : "";
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
  if (value === "japanese" || value === "clean") return value;
  return "default";
}

export function baseUrlFor(_prefs: Preferences): string {
  // return _prefs.useExHentai && _prefs.account ? EX_BASE_URL : EH_BASE_URL;
  return EH_BASE_URL;
}

export async function loadPreferences(): Promise<Preferences> {
  const [
    hiddenTags,
    excludedCategories,
    titleDisplay,
    // originalImages,
    // useExHentai,
    // memberId,
    // passHash,
    // igneous,
  ] = await Promise.all([
    ObjectStore.string(PREF_HIDDEN_TAGS),
    ObjectStore.stringArray(PREF_EXCLUDED_CATEGORIES),
    ObjectStore.string(PREF_TITLE_DISPLAY),
    // ObjectStore.boolean(PREF_ORIGINAL_IMAGES),
    // ObjectStore.boolean(PREF_USE_EXHENTAI),
    // SecureStore.string(SECURE_MEMBER_ID),
    // SecureStore.string(SECURE_PASS_HASH),
    // SecureStore.string(SECURE_IGNEOUS),
  ]);

  // const trimmedId = memberId?.trim() || "";
  // const trimmedHash = passHash?.trim() || "";
  // const trimmedIgneous = igneous?.trim() || undefined;
  // const account: AccountCookies | null =
  //   trimmedId && trimmedHash
  //     ? { memberId: trimmedId, passHash: trimmedHash, igneous: trimmedIgneous }
  //     : null;

  return {
    hiddenTags: parseHiddenTags(hiddenTags),
    excludedCategories: excludedCategories ?? [],
    titleDisplay: parseTitleDisplay(titleDisplay),
    // originalImages: originalImages ?? false,
    // useExHentai: Boolean(useExHentai && account),
    // account,
  };
}

export function buildSettingsForm(prefs: Preferences): UIForm {
  return {
    sections: [
      {
        header: "Content",
        footer:
          "Hidden tags apply to browse feeds and search. Use namespaced tags like female:futanari, male:yaoi, other:ai generated, artist:name, or bare tags like guro.",
        views: [
          UITextField({
            id: PREF_HIDDEN_TAGS,
            title: "Hidden Tags",
            placeholder: "Comma-separated, e.g. male:yaoi, other:ai generated",
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
            defaultValue: "default",
            currentValue: prefs.titleDisplay,
          }),
        ],
      },
      // TODO: Revisit account & ExHentai support later
      // {
      //   header: "Reader",
      //   footer:
      //     "Original full-resolution images require signing in with your E-Hentai cookies below and consume GP/quota when applicable.",
      //   views: [
      //     UIToggle({
      //       id: PREF_ORIGINAL_IMAGES,
      //       title: "Load Original Images (When Signed In)",
      //       defaultValue: false,
      //       currentValue: prefs.originalImages,
      //     }),
      //   ],
      // },
      // {
      //   header: "Account & ExHentai (Optional)",
      //   footer: prefs.account
      //     ? `Signed in (ipb_member_id=${prefs.account.memberId}${prefs.useExHentai ? ", ExHentai enabled" : ""}). Clear Member ID and Pass Hash to sign out.`
      //     : "Optional: enter your e-hentai.org browser cookies to unlock Watched, Favorites, higher image limits, and ExHentai.",
      //   views: [
      //     UITextField({
      //       id: PREF_MEMBER_ID,
      //       title: "ipb_member_id",
      //       placeholder: "Numeric member ID cookie",
      //       defaultValue: "",
      //       currentValue: prefs.account?.memberId ?? "",
      //     }),
      //     UITextField({
      //       id: PREF_PASS_HASH,
      //       title: "ipb_pass_hash",
      //       placeholder: "32-char hex pass hash cookie",
      //       isSecure: true,
      //       defaultValue: "",
      //       currentValue: prefs.account?.passHash ?? "",
      //     }),
      //     UITextField({
      //       id: PREF_IGNEOUS,
      //       title: "igneous (ExHentai)",
      //       placeholder: "Optional ExHentai igneous cookie",
      //       isSecure: true,
      //       defaultValue: "",
      //       currentValue: prefs.account?.igneous ?? "",
      //     }),
      //     UIToggle({
      //       id: PREF_USE_EXHENTAI,
      //       title: "Use ExHentai (exhentai.org)",
      //       defaultValue: false,
      //       currentValue: prefs.useExHentai,
      //     }),
      //   ],
      // },
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
    titleDisplay === "default" ||
    titleDisplay === "japanese" ||
    titleDisplay === "clean"
  ) {
    await ObjectStore.set(PREF_TITLE_DISPLAY, titleDisplay);
  }

  // TODO: Revisit account & ExHentai support later
  // if (typeof data[PREF_ORIGINAL_IMAGES] === "boolean") {
  //   await ObjectStore.set(PREF_ORIGINAL_IMAGES, data[PREF_ORIGINAL_IMAGES]);
  // }
  // const hasMemberField = typeof data[PREF_MEMBER_ID] === "string";
  // const hasPassField = typeof data[PREF_PASS_HASH] === "string";
  // if (hasMemberField || hasPassField) {
  //   const memberId = hasMemberField
  //     ? (data[PREF_MEMBER_ID] as string).trim()
  //     : ((await SecureStore.string(SECURE_MEMBER_ID)) ?? "").trim();
  //   const passHash = hasPassField
  //     ? (data[PREF_PASS_HASH] as string).trim()
  //     : ((await SecureStore.string(SECURE_PASS_HASH)) ?? "").trim();
  //   if (!memberId && !passHash) {
  //     await Promise.all([
  //       SecureStore.remove(SECURE_MEMBER_ID),
  //       SecureStore.remove(SECURE_PASS_HASH),
  //       SecureStore.remove(SECURE_IGNEOUS),
  //     ]);
  //   } else if (!memberId || !passHash) {
  //     throw new Error(
  //       "Provide both ipb_member_id and ipb_pass_hash, or clear both to sign out."
  //     );
  //   } else {
  //     await Promise.all([
  //       SecureStore.set(SECURE_MEMBER_ID, memberId),
  //       SecureStore.set(SECURE_PASS_HASH, passHash),
  //     ]);
  //   }
  // }
  // if (typeof data[PREF_IGNEOUS] === "string") {
  //   const igneous = (data[PREF_IGNEOUS] as string).trim();
  //   if (igneous && igneous.toLowerCase() !== "mystery") {
  //     await SecureStore.set(SECURE_IGNEOUS, igneous);
  //   } else {
  //     await SecureStore.remove(SECURE_IGNEOUS);
  //   }
  // }
  // if (typeof data[PREF_USE_EXHENTAI] === "boolean") {
  //   const wantsEx = data[PREF_USE_EXHENTAI] as boolean;
  //   const memberId = await SecureStore.string(SECURE_MEMBER_ID);
  //   const passHash = await SecureStore.string(SECURE_PASS_HASH);
  //   if (wantsEx && (!memberId || !passHash)) {
  //     throw new Error(
  //       "Enter your ipb_member_id and ipb_pass_hash cookies before enabling ExHentai."
  //     );
  //   }
  //   await ObjectStore.set(PREF_USE_EXHENTAI, wantsEx);
  // }
}
