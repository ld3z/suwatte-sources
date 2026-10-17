import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://chikari.moe";
export const BROWSE_LIMIT = 40;
/** The chapter list endpoint caps `limit` at 500. */
export const CHAPTER_PAGE_LIMIT = 500;

export const PREF_SHOW_18 = "pref_18_mode";
export const PREF_EXCLUDE_GENRES = "pref_exclude_genres";
export const PREF_CONTENT_TYPES = "pref_content_types";

/** Fallback genres; the live list comes from `/api/genres`. */
export const GENRE_OPTIONS: LabeledOption[] = [
  { id: "action", title: "Action" },
  { id: "adult", title: "Adult" },
  { id: "adventure", title: "Adventure" },
  { id: "award_winning", title: "Award Winning" },
  { id: "boys_love", title: "Boys Love" },
  { id: "comedy", title: "Comedy" },
  { id: "doujinshi", title: "Doujinshi" },
  { id: "drama", title: "Drama" },
  { id: "ecchi", title: "Ecchi" },
  { id: "erotica", title: "Erotica" },
  { id: "fantasy", title: "Fantasy" },
  { id: "gender_bender", title: "Gender Bender" },
  { id: "girls_love", title: "Girls Love" },
  { id: "gourmet", title: "Gourmet" },
  { id: "harem", title: "Harem" },
  { id: "historical", title: "Historical" },
  { id: "horror", title: "Horror" },
  { id: "josei", title: "Josei" },
  { id: "lolicon", title: "Lolicon" },
  { id: "mahou_shoujo", title: "Mahou Shoujo" },
  { id: "martial_arts", title: "Martial Arts" },
  { id: "mature", title: "Mature" },
  { id: "mecha", title: "Mecha" },
  { id: "music", title: "Music" },
  { id: "mystery", title: "Mystery" },
  { id: "psychological", title: "Psychological" },
  { id: "romance", title: "Romance" },
  { id: "school_life", title: "School Life" },
  { id: "sci-fi", title: "Sci-Fi" },
  { id: "seinen", title: "Seinen" },
  { id: "shotacon", title: "Shotacon" },
  { id: "shoujo", title: "Shoujo" },
  { id: "shoujo_ai", title: "Shoujo Ai" },
  { id: "shounen", title: "Shounen" },
  { id: "shounen_ai", title: "Shounen Ai" },
  { id: "slice_of_life", title: "Slice of Life" },
  { id: "smut", title: "Smut" },
  { id: "sports", title: "Sports" },
  { id: "supernatural", title: "Supernatural" },
  { id: "suspense", title: "Suspense" },
  { id: "thriller", title: "Thriller" },
  { id: "tragedy", title: "Tragedy" },
  { id: "yaoi", title: "Yaoi" },
  { id: "yuri", title: "Yuri" },
];

export const TYPE_OPTIONS: LabeledOption[] = [
  { id: "manga", title: "Manga" },
  { id: "manhwa", title: "Manhwa" },
  { id: "manhua", title: "Manhua" },
  { id: "oel", title: "OEL" },
];
/** The site's own default; OEL is opt-in. */
export const DEFAULT_CONTENT_TYPES = ["manga", "manhwa", "manhua"];

export const STATUS_OPTIONS: LabeledOption[] = [
  { id: "releasing", title: "Releasing" },
  { id: "completed", title: "Completed" },
  { id: "hiatus", title: "Hiatus" },
  { id: "cancelled", title: "Cancelled" },
  { id: "upcoming", title: "Upcoming" },
];

export const SORT_OPTIONS: LabeledOption[] = [
  { id: "trending", title: "Trending" },
  { id: "popular", title: "Popularity" },
  { id: "top_rated", title: "Top Rated" },
  { id: "bingeable", title: "Complete & Bingeable" },
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
  { id: "bingeable", title: "Complete & Bingeable", sort: "bingeable" },
];
