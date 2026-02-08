import { CatalogRating, RunnerInfo } from "@suwatte/daisuke";

export const INFO: RunnerInfo = {
    id: "com.roliascan",
    name: "RoliaScan",
    version: 0.3,
    website: "https://roliascan.com",
    supportedLanguages: ["en_US"],
    thumbnail: "roliascan_logo.png",
    minSupportedAppVersion: "6.0.0",
    rating: CatalogRating.MIXED,
};

export const BASE_URL = "https://roliascan.com";
export const PREFIX_SEARCH = "id:";
