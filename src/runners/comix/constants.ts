import { CatalogRating, RunnerInfo } from "@suwatte/daisuke";

export const INFO: RunnerInfo = {
  id: "to.comix",
  name: "Comix",
  version: 0.5,
  website: "https://comix.to",
  supportedLanguages: ["EN_US"],
  thumbnail: "comix_logo.png",
  minSupportedAppVersion: "6.0.0",
  rating: CatalogRating.MIXED,
};

export const BASE_URL = "https://comix.to";
export const API_URL = "https://comix.to/api/v2";

// NSFW genre IDs to filter out when NSFW is disabled
export const NSFW_GENRE_IDS = ["87264", "8", "87265", "13", "87266", "87268"];

// Genre list for filters (name, id)
export const GENRES = [
  ["Action", "6"],
  ["Adult", "87264"],
  ["Adventure", "7"],
  ["Boys Love", "8"],
  ["Comedy", "9"],
  ["Crime", "10"],
  ["Drama", "11"],
  ["Ecchi", "87265"],
  ["Fantasy", "12"],
  ["Girls Love", "13"],
  ["Hentai", "87266"],
  ["Historical", "14"],
  ["Horror", "15"],
  ["Isekai", "16"],
  ["Magical Girls", "17"],
  ["Mature", "87267"],
  ["Mecha", "18"],
  ["Medical", "19"],
  ["Mystery", "20"],
  ["Philosophical", "21"],
  ["Psychological", "22"],
  ["Romance", "23"],
  ["Sci-Fi", "24"],
  ["Slice of Life", "25"],
  ["Smut", "87268"],
  ["Sports", "26"],
  ["Superhero", "27"],
  ["Thriller", "28"],
  ["Tragedy", "29"],
  ["Wuxia", "30"],
  ["Aliens", "31"],
  ["Animals", "32"],
  ["Cooking", "33"],
  ["Cross Dressing", "34"],
  ["Delinquents", "35"],
  ["Demons", "36"],
  ["Genderswap", "37"],
  ["Ghosts", "38"],
  ["Gyaru", "39"],
  ["Harem", "40"],
  ["Incest", "41"],
  ["Loli", "42"],
  ["Mafia", "43"],
  ["Magic", "44"],
  ["Martial Arts", "45"],
  ["Military", "46"],
  ["Monster Girls", "47"],
  ["Monsters", "48"],
  ["Music", "49"],
  ["Ninja", "50"],
  ["Office Workers", "51"],
  ["Police", "52"],
  ["Post-Apocalyptic", "53"],
  ["Reincarnation", "54"],
  ["Reverse Harem", "55"],
  ["Samurai", "56"],
  ["School Life", "57"],
  ["Shota", "58"],
  ["Supernatural", "59"],
  ["Survival", "60"],
  ["Time Travel", "61"],
  ["Traditional Games", "62"],
  ["Vampires", "63"],
  ["Video Games", "64"],
  ["Villainess", "65"],
  ["Virtual Reality", "66"],
  ["Zombies", "67"],
] as const;

// Demographics for filters
export const DEMOGRAPHICS = [
  ["Shoujo", "1"],
  ["Shounen", "2"],
  ["Josei", "3"],
  ["Seinen", "4"],
] as const;

// Publication status
export const PUBLICATION_STATUS = [
  ["Finished", "finished"],
  ["Releasing", "releasing"],
  ["On Hiatus", "on_hiatus"],
  ["Discontinued", "discontinued"],
  ["Not Yet Released", "not_yet_released"],
] as const;

// Content types
export const CONTENT_TYPES = [
  ["Manga", "manga"],
  ["Manhwa", "manhwa"],
  ["Manhua", "manhua"],
  ["Other", "other"],
] as const;

// Sort options
export const SORT_OPTIONS = [
  ["Best Match", "relevance", "desc"],
  ["Popular (30 days)", "views_30d", "desc"],
  ["Latest Updates", "chapter_updated_at", "desc"],
  ["Recently Added", "created_at", "desc"],
  ["Title (A-Z)", "title", "asc"],
  ["Title (Z-A)", "title", "desc"],
  ["Year (Newest)", "year", "desc"],
  ["Year (Oldest)", "year", "asc"],
  ["Total Views", "total_views", "desc"],
  ["Most Follows", "followed_count", "desc"],
] as const;

// Official scanlation group ID (preferred in deduplication)
export const OFFICIAL_GROUP_ID = 9275;