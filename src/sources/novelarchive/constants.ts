import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://novelarchive.cc";
export const PAGE_LIMIT = 24;
/** The trending and recently updated endpoints return at most 50 novels and ignore paging. */
export const SHORT_LIST_LIMIT = 50;

export const DEFAULT_SORT = "popular";

/** Fallback genres; the live list comes from `/api/novels/genres`. */
export const GENRE_OPTIONS: LabeledOption[] = [
  { id: "action", title: "Action" },
  { id: "adult", title: "Adult" },
  { id: "adventure", title: "Adventure" },
  { id: "comedy", title: "Comedy" },
  { id: "drama", title: "Drama" },
  { id: "ecchi", title: "Ecchi" },
  { id: "fantasy", title: "Fantasy" },
  { id: "harem", title: "Harem" },
  { id: "historical", title: "Historical" },
  { id: "horror", title: "Horror" },
  { id: "martial arts", title: "Martial Arts" },
  { id: "mature", title: "Mature" },
  { id: "mystery", title: "Mystery" },
  { id: "psychological", title: "Psychological" },
  { id: "reincarnation", title: "Reincarnation" },
  { id: "romance", title: "Romance" },
  { id: "school life", title: "School Life" },
  { id: "sci-fi", title: "Sci-Fi" },
  { id: "slice of life", title: "Slice of Life" },
  { id: "smut", title: "Smut" },
  { id: "supernatural", title: "Supernatural" },
  { id: "system", title: "System" },
  { id: "tragedy", title: "Tragedy" },
  { id: "wuxia", title: "Wuxia" },
  { id: "xianxia", title: "Xianxia" },
  { id: "xuanhuan", title: "Xuanhuan" },
];

export const GENRE_MATCH_OPTIONS: LabeledOption[] = [
  { id: "all", title: "Match All Selected" },
  { id: "any", title: "Match Any Selected" },
];

export const STATUS_OPTIONS: LabeledOption[] = [
  { id: "all", title: "All" },
  { id: "ongoing", title: "Ongoing" },
  { id: "completed", title: "Completed" },
  { id: "hiatus", title: "Hiatus" },
];

export const SORT_OPTIONS: LabeledOption[] = [
  { id: "popular", title: "Popular" },
  { id: "rating", title: "Rating" },
  { id: "recent", title: "Recently Added" },
  { id: "chapters", title: "Most Chapters" },
];

export interface FeedDefinition {
  id: string;
  title: string;
  /** Unpaged endpoint, for feeds that aren't a sorted `/novels` listing. */
  endpoint?: string;
  sort?: string;
  status?: string;
}

/** Home page feeds, in display order. Unknown feed keys fall back to the first entry. */
export const FEEDS: FeedDefinition[] = [
  { id: "trending", title: "Trending", endpoint: "/novels/trending" },
  { id: "recently_updated", title: "Recently Updated", endpoint: "/novels/recently-updated" },
  { id: "editors_choice", title: "Editor's Choice", endpoint: "/novels/editors-choice" },
  { id: "popular", title: "Popular", sort: "popular" },
  { id: "top_rated", title: "Top Rated", sort: "rating" },
  { id: "recently_added", title: "Recently Added", sort: "recent" },
  { id: "completed", title: "Completed", sort: "popular", status: "completed" },
];
