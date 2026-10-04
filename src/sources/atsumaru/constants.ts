import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://atsu.moe";
export const CDN_URL = "https://cdn.atsu.moe";
export const BROWSE_LIMIT = 40;

export const PREF_SHOW_18 = "pref_18_mode";
export const PREF_EXCLUDE_GENRES = "pref_exclude_genres";
export const PREF_EXCLUDE_GENRES_IN_SEARCH = "pref_exclude_genres_in_search";
export const PREF_CONTENT_TYPES = "pref_content_types";
export const PREF_MAX_CONTENT_RATING = "pref_max_content_rating";
export const PREF_MIN_CHAPTERS = "pref_min_chapters";
export const PREF_OFFICIAL_ONLY = "pref_official_only";
export const PREF_HIDDEN_KEYWORDS = "pref_hidden_keywords";

export const DEFAULT_CONTENT_TYPES = ["Manga", "Manwha", "Manhua", "OEL"];

export const CONTENT_RATING_OPTIONS: LabeledOption[] = [
  { id: "Safe", title: "Safe" },
  { id: "Suggestive", title: "Suggestive" },
  { id: "Erotica", title: "Erotica" },
];
export const DEFAULT_MAX_CONTENT_RATING = "Erotica";

export const GENRE_OPTIONS: LabeledOption[] = [
  { id: "39", title: "Action" },
  { id: "46", title: "Adult" },
  { id: "37", title: "Adventure" },
  { id: "180", title: "Boys Love" },
  { id: "6", title: "Comedy" },
  { id: "31", title: "Drama" },
  { id: "36", title: "Fantasy" },
  { id: "4", title: "Girls Love" },
  { id: "10", title: "Hentai" },
  { id: "45", title: "Historical" },
  { id: "44", title: "Horror" },
  { id: "29", title: "Martial Arts" },
  { id: "32", title: "Mystery" },
  { id: "18", title: "Psychological" },
  { id: "9", title: "Romance" },
  { id: "1", title: "Sci-Fi" },
  { id: "7", title: "Slice of Life" },
  { id: "41", title: "Smut" },
  { id: "22", title: "Supernatural" },
  { id: "19", title: "Thriller" },
  { id: "5", title: "Tragedy" },
];

export const TYPE_OPTIONS: LabeledOption[] = [
  { id: "Manga", title: "Manga" },
  { id: "Manwha", title: "Manhwa" },
  { id: "Manhua", title: "Manhua" },
  { id: "OEL", title: "OEL" },
  { id: "Other", title: "Other" },
];

export const STATUS_OPTIONS: LabeledOption[] = [
  { id: "Ongoing", title: "Ongoing" },
  { id: "Completed", title: "Completed" },
  { id: "Hiatus", title: "Hiatus" },
  { id: "Canceled", title: "Canceled" },
];

export const SORT_OPTIONS: LabeledOption[] = [
  { id: "views", title: "Popularity" },
  { id: "trending", title: "Trending" },
  { id: "dateAdded", title: "Date Added" },
  { id: "released", title: "Release Date" },
  { id: "mbRating", title: "Top Rated" },
  { id: "title", title: "Title" },
];

export interface FeedDefinition {
  id: string;
  title: string;
  endpoint: "popular" | "recentlyUpdated";
  timeframe?: "daily" | "weekly" | "monthly";
}

/** Home page feeds, in display order. Unknown feed keys fall back to the first entry. */
export const FEEDS: FeedDefinition[] = [
  { id: "popular_daily", title: "Popular Today", endpoint: "popular", timeframe: "daily" },
  { id: "popular_weekly", title: "Popular This Week", endpoint: "popular", timeframe: "weekly" },
  { id: "popular_monthly", title: "Popular This Month", endpoint: "popular", timeframe: "monthly" },
  { id: "recently_updated", title: "Recently Updated", endpoint: "recentlyUpdated" },
];
