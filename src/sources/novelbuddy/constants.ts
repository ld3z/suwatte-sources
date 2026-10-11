import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://novelbuddy.me";
export const API_URL = "https://api.novelbuddy.me";
export const PAGE_LIMIT = 24;

export const DEFAULT_SORT = "popular";

export const GENRE_OPTIONS: LabeledOption[] = [
  { id: "action", title: "Action" },
  { id: "adult", title: "Adult" },
  { id: "adventure", title: "Adventure" },
  { id: "comedy", title: "Comedy" },
  { id: "drama", title: "Drama" },
  { id: "eastern", title: "Eastern" },
  { id: "ecchi", title: "Ecchi" },
  { id: "fan-fiction", title: "Fan-Fiction" },
  { id: "fantasy", title: "Fantasy" },
  { id: "game", title: "Game" },
  { id: "gender-bender", title: "Gender Bender" },
  { id: "harem", title: "Harem" },
  { id: "historical", title: "Historical" },
  { id: "horror", title: "Horror" },
  { id: "josei", title: "Josei" },
  { id: "martial-arts", title: "Martial Arts" },
  { id: "mature", title: "Mature" },
  { id: "mecha", title: "Mecha" },
  { id: "military", title: "Military" },
  { id: "modern-life", title: "Modern Life" },
  { id: "mystery", title: "Mystery" },
  { id: "psychological", title: "Psychological" },
  { id: "reincarnation", title: "Reincarnation" },
  { id: "romance", title: "Romance" },
  { id: "school-life", title: "School Life" },
  { id: "sci-fi", title: "Sci-fi" },
  { id: "seinen", title: "Seinen" },
  { id: "shoujo", title: "Shoujo" },
  { id: "shoujo-ai", title: "Shoujo Ai" },
  { id: "shounen", title: "Shounen" },
  { id: "shounen-ai", title: "Shounen Ai" },
  { id: "slice-of-life", title: "Slice of Life" },
  { id: "smut", title: "Smut" },
  { id: "sports", title: "Sports" },
  { id: "supernatural", title: "Supernatural" },
  { id: "system", title: "System" },
  { id: "tragedy", title: "Tragedy" },
  { id: "urban", title: "Urban" },
  { id: "urban-life", title: "Urban Life" },
  { id: "wuxia", title: "Wuxia" },
  { id: "xianxia", title: "Xianxia" },
  { id: "xuanhuan", title: "Xuanhuan" },
  { id: "yaoi", title: "Yaoi" },
  { id: "yuri", title: "Yuri" },
];

export const STATUS_OPTIONS: LabeledOption[] = [
  { id: "", title: "Any" },
  { id: "ongoing", title: "Ongoing" },
  { id: "completed", title: "Completed" },
  { id: "hiatus", title: "Hiatus" },
  { id: "cancelled", title: "Cancelled" },
];

export const TYPE_OPTIONS: LabeledOption[] = [
  { id: "", title: "Any" },
  { id: "chinese", title: "Chinese" },
  { id: "korean", title: "Korean" },
  { id: "japanese", title: "Japanese" },
];

export const SORT_OPTIONS: LabeledOption[] = [
  { id: "popular", title: "Most Followed" },
  { id: "latest", title: "Latest Updated" },
  { id: "newest", title: "Recently Added" },
  { id: "rating", title: "Highest Rating" },
  { id: "views_today", title: "Most Viewed: Today" },
  { id: "views_7days", title: "Most Viewed: 7 Days" },
  { id: "views_30days", title: "Most Viewed: 30 Days" },
  { id: "views", title: "Most Viewed: All Time" },
  { id: "chapters", title: "Most Chapters" },
  { id: "alphabetical", title: "A-Z" },
];

export interface FeedDefinition {
  id: string;
  title: string;
  sort: string;
  status?: string;
}

/** Home page feeds, in display order. Unknown feed keys fall back to the first entry. */
export const FEEDS: FeedDefinition[] = [
  { id: "trending", title: "Trending Today", sort: "views_today" },
  { id: "popular", title: "Most Followed", sort: "popular" },
  { id: "latest", title: "Latest Updates", sort: "latest" },
  { id: "top_rated", title: "Top Rated", sort: "rating" },
  { id: "new", title: "Recently Added", sort: "newest" },
  { id: "completed", title: "Completed", sort: "popular", status: "completed" },
];
