import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://chikari.moe";
export const BROWSE_LIMIT = 40;
/** The chapter list endpoint caps `limit` at 500. */
export const CHAPTER_PAGE_LIMIT = 500;

export const PREF_SHOW_18 = "pref_18_mode";
export const PREF_EXCLUDE_GENRES = "pref_exclude_genres";

/** Fallback genres; the live list comes from `/api/novels/genres`. */
export const GENRE_OPTIONS: LabeledOption[] = [
  { id: "action", title: "Action" },
  { id: "adventure", title: "Adventure" },
  { id: "comedy", title: "Comedy" },
  { id: "drama", title: "Drama" },
  { id: "ecchi", title: "Ecchi" },
  { id: "fantasy", title: "Fantasy" },
  { id: "gender_bender", title: "Gender Bender" },
  { id: "harem", title: "Harem" },
  { id: "historical", title: "Historical" },
  { id: "horror", title: "Horror" },
  { id: "josei", title: "Josei" },
  { id: "martial_arts", title: "Martial Arts" },
  { id: "mature", title: "Mature" },
  { id: "mecha", title: "Mecha" },
  { id: "mystery", title: "Mystery" },
  { id: "psychological", title: "Psychological" },
  { id: "romance", title: "Romance" },
  { id: "school_life", title: "School Life" },
  { id: "sci-fi", title: "Sci-Fi" },
  { id: "seinen", title: "Seinen" },
  { id: "shoujo", title: "Shoujo" },
  { id: "shoujo_ai", title: "Shoujo Ai" },
  { id: "shounen", title: "Shounen" },
  { id: "shounen_ai", title: "Shounen Ai" },
  { id: "slice_of_life", title: "Slice of Life" },
  { id: "sports", title: "Sports" },
  { id: "supernatural", title: "Supernatural" },
  { id: "tragedy", title: "Tragedy" },
  { id: "yaoi", title: "Yaoi" },
  { id: "yuri", title: "Yuri" },
];

export const STATUS_OPTIONS: LabeledOption[] = [
  { id: "releasing", title: "Releasing" },
  { id: "completed", title: "Completed" },
];

export const SORT_OPTIONS: LabeledOption[] = [
  { id: "trending", title: "Trending" },
  { id: "popular", title: "Popularity" },
  { id: "top_rated", title: "Top Rated" },
  { id: "updated", title: "Recently Updated" },
  { id: "added", title: "Recently Added" },
  { id: "most_bookmarked", title: "Most Bookmarked" },
  { id: "random", title: "Random" },
];
export const DEFAULT_SORT = "popular";

export interface FeedDefinition {
  id: string;
  title: string;
  sort: string;
  status?: string;
}

/** Home page feeds, in display order. Unknown feed keys fall back to the first entry. */
export const FEEDS: FeedDefinition[] = [
  { id: "trending", title: "Trending", sort: "trending" },
  { id: "popular", title: "Popular", sort: "popular" },
  { id: "top_rated", title: "Top Rated", sort: "top_rated" },
  { id: "recently_updated", title: "Recently Updated", sort: "updated" },
  { id: "recently_added", title: "Recently Added", sort: "added" },
  { id: "most_bookmarked", title: "Most Bookmarked", sort: "most_bookmarked" },
  { id: "completed", title: "Completed", sort: "popular", status: "completed" },
];
