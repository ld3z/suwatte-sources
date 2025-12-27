import { CatalogRating, RunnerInfo } from "@suwatte/daisuke";

export const INFO: RunnerInfo = {
  id: "org.weebdex",
  name: "WeebDex",
  version: 0.2,
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