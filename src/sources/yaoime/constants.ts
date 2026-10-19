import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://yaoi.me";

/** Sent so the site treats the client as having passed the 18+ gate. */
export const ADULT_COOKIE = "yf.adult=1";

/** Chapter pages 403 without a browser-like UA. */
export const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export const COVER_WIDTH = 720;
export const PAGE_WIDTH = 1400;

export const DEFAULT_SORT = "update";

export const SORT_OPTIONS: LabeledOption[] = [
  { id: "update", title: "Last Updated" },
  { id: "create", title: "Newest Added" },
  { id: "popular", title: "Popularity" },
  { id: "rating", title: "Rating" },
  { id: "chapters", title: "Chapter Count" },
  { id: "az", title: "Title" },
];

export const TYPE_OPTIONS: LabeledOption[] = [
  { id: "manga", title: "Manga" },
  { id: "manhwa", title: "Manhwa" },
  { id: "manhua", title: "Manhua" },
  { id: "oel", title: "OEL" },
  { id: "doujinshi", title: "Doujinshi" },
  { id: "other", title: "Other" },
  { id: "novel", title: "Novel" },
];

export const STATUS_OPTIONS: LabeledOption[] = [
  { id: "ongoing", title: "Ongoing" },
  { id: "completed", title: "Completed" },
  { id: "hiatus", title: "Hiatus" },
  { id: "cancelled", title: "Cancelled" },
  { id: "upcoming", title: "Upcoming" },
  { id: "unknown", title: "Unknown" },
];

export const CONTENT_OPTIONS: LabeledOption[] = [
  { id: "safe", title: "Safe" },
  { id: "suggestive", title: "Suggestive" },
  { id: "erotica", title: "Erotica" },
  { id: "pornographic", title: "Pornographic" },
];

/** Genre names as used in `/browse?genre=`. */
export const GENRE_OPTIONS: LabeledOption[] = [
  { id: "Action", title: "Action" },
  { id: "Adventure", title: "Adventure" },
  { id: "Award Winning", title: "Award Winning" },
  { id: "Boys Love", title: "Boys Love" },
  { id: "Comedy", title: "Comedy" },
  { id: "Doujinshi", title: "Doujinshi" },
  { id: "Drama", title: "Drama" },
  { id: "Fantasy", title: "Fantasy" },
  { id: "Gender Bender", title: "Gender Bender" },
  { id: "Girls Love", title: "Girls Love" },
  { id: "Gourmet", title: "Gourmet" },
  { id: "Harem", title: "Harem" },
  { id: "Historical", title: "Historical" },
  { id: "Horror", title: "Horror" },
  { id: "Lolicon", title: "Lolicon" },
  { id: "Mahou Shoujo", title: "Mahou Shoujo" },
  { id: "Martial Arts", title: "Martial Arts" },
  { id: "Mature", title: "Mature" },
  { id: "Mecha", title: "Mecha" },
  { id: "Music", title: "Music" },
  { id: "Mystery", title: "Mystery" },
  { id: "Psychological", title: "Psychological" },
  { id: "Romance", title: "Romance" },
  { id: "School Life", title: "School Life" },
  { id: "Sci-Fi", title: "Sci-Fi" },
  { id: "Shotacon", title: "Shotacon" },
  { id: "Shoujo", title: "Shoujo" },
  { id: "Shoujo Ai", title: "Shoujo Ai" },
  { id: "Shounen", title: "Shounen" },
  { id: "Slice of Life", title: "Slice of Life" },
  { id: "Sports", title: "Sports" },
  { id: "Supernatural", title: "Supernatural" },
  { id: "Suspense", title: "Suspense" },
  { id: "Thriller", title: "Thriller" },
  { id: "Tragedy", title: "Tragedy" },
  { id: "Yuri", title: "Yuri" },
];

export interface FeedDefinition {
  id: string;
  title: string;
  sort: string;
}

/** Home page feeds, in display order. Unknown feed keys fall back to the first entry. */
export const FEEDS: FeedDefinition[] = [
  { id: "latest", title: "Latest Updates", sort: "update" },
  { id: "popular", title: "Popular", sort: "popular" },
  { id: "top_rated", title: "Top Rated", sort: "rating" },
  { id: "new", title: "Newly Added", sort: "create" },
];
