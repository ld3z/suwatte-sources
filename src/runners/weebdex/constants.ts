import { CatalogRating, RunnerInfo } from "@suwatte/daisuke";

export const INFO: RunnerInfo = {
  id: "org.weebdex",
  name: "WeebDex",
  version: 0.3,
  website: "https://weebdex.org",
  supportedLanguages: ["MULTI"],
  thumbnail: "weebdex_logo.png",
  minSupportedAppVersion: "6.0.0",
  rating: CatalogRating.MIXED,
};

export const BASE_URL = "https://api.weebdex.org";
export const SITE_URL = "https://weebdex.org";
export const COVER_BASE_URL = "https://srv.notdelta.xyz";

export const REQUIRED_HEADERS = {
  Origin: SITE_URL,
  Referer: `${SITE_URL}/`,
};

export const DEFAULT_CONTENT_RATINGS = ["safe", "suggestive", "erotica"];

export const DEMOGRAPHICS = {
  shounen: "Shounen",
  shoujo: "Shoujo",
  josei: "Josei",
  seinen: "Seinen",
  none: "None",
} as const;

export const CONTENT_RATINGS = {
  safe: "Safe",
  suggestive: "Suggestive",
  erotica: "Erotica",
  pornographic: "Pornographic",
} as const;

export const PUBLICATION_STATUS = {
  ongoing: "Ongoing",
  completed: "Completed",
  hiatus: "Hiatus",
  cancelled: "Cancelled",
} as const;

export const LANGUAGE_OPTIONS: [string, string][] = [
  ["Arabic", "ar"],
  ["Bengali", "bn"],
  ["Bulgarian", "bg"],
  ["Catalan", "ca"],
  ["Chinese (Simplified)", "zh"],
  ["Chinese (Traditional)", "zh-hk"],
  ["Czech", "cs"],
  ["Danish", "da"],
  ["Dutch", "nl"],
  ["English", "en"],
  ["Finnish", "fi"],
  ["French", "fr"],
  ["German", "de"],
  ["Greek", "el"],
  ["Hebrew", "he"],
  ["Hindi", "hi"],
  ["Hungarian", "hu"],
  ["Indonesian", "id"],
  ["Italian", "it"],
  ["Japanese", "ja"],
  ["Korean", "ko"],
  ["Malay", "ms"],
  ["Norwegian", "no"],
  ["Persian", "fa"],
  ["Polish", "pl"],
  ["Portuguese (Brazil)", "pt-br"],
  ["Portuguese (Portugal)", "pt"],
  ["Romanian", "ro"],
  ["Russian", "ru"],
  ["Spanish", "es"],
  ["Spanish (Latin America)", "es-la"],
  ["Swedish", "sv"],
  ["Thai", "th"],
  ["Turkish", "tr"],
  ["Ukrainian", "uk"],
  ["Vietnamese", "vi"],
];