import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://atsu.moe";
export const CDN_URL = "https://cdn.atsu.moe";
export const BROWSE_LIMIT = 40;

export const PREF_SHOW_18 = "pref_18_mode";
export const PREF_EXCLUDE_GENRES = "pref_exclude_genres";

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

export const FEED_POPULAR_DAILY = "popular_daily";
export const FEED_POPULAR_WEEKLY = "popular_weekly";
export const FEED_POPULAR_MONTHLY = "popular_monthly";
export const FEED_RECENTLY_UPDATED = "recently_updated";
