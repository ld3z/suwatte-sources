import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://novelfire.net";

export const DEFAULT_SORT = "rank-top";

/** Genre ids used by the advanced search form (`categories[]`). */
export const GENRE_OPTIONS: LabeledOption[] = [
  { id: "3", title: "Action" },
  { id: "28", title: "Adult" },
  { id: "4", title: "Adventure" },
  { id: "46", title: "Anime" },
  { id: "47", title: "Arts" },
  { id: "5", title: "Comedy" },
  { id: "24", title: "Drama" },
  { id: "44", title: "Eastern" },
  { id: "26", title: "Ecchi" },
  { id: "48", title: "Fan-fiction" },
  { id: "6", title: "Fantasy" },
  { id: "19", title: "Game" },
  { id: "25", title: "Gender Bender" },
  { id: "7", title: "Harem" },
  { id: "12", title: "Historical" },
  { id: "37", title: "Horror" },
  { id: "49", title: "Isekai" },
  { id: "2", title: "Josei" },
  { id: "45", title: "LGBT+" },
  { id: "50", title: "Magic" },
  { id: "51", title: "Magical Realism" },
  { id: "52", title: "Manhua" },
  { id: "15", title: "Martial Arts" },
  { id: "8", title: "Mature" },
  { id: "34", title: "Mecha" },
  { id: "53", title: "Military" },
  { id: "54", title: "Modern Life" },
  { id: "55", title: "Movies" },
  { id: "16", title: "Mystery" },
  { id: "64", title: "Other" },
  { id: "9", title: "Psychological" },
  { id: "56", title: "Realistic Fiction" },
  { id: "43", title: "Reincarnation" },
  { id: "1", title: "Romance" },
  { id: "21", title: "School Life" },
  { id: "20", title: "Sci-fi" },
  { id: "10", title: "Seinen" },
  { id: "38", title: "Shoujo" },
  { id: "57", title: "Shoujo Ai" },
  { id: "17", title: "Shounen" },
  { id: "39", title: "Shounen Ai" },
  { id: "13", title: "Slice of Life" },
  { id: "29", title: "Smut" },
  { id: "42", title: "Sports" },
  { id: "18", title: "Supernatural" },
  { id: "58", title: "System" },
  { id: "32", title: "Tragedy" },
  { id: "63", title: "Urban" },
  { id: "59", title: "Urban Life" },
  { id: "60", title: "Video Games" },
  { id: "61", title: "War" },
  { id: "31", title: "Wuxia" },
  { id: "23", title: "Xianxia" },
  { id: "22", title: "Xuanhuan" },
  { id: "14", title: "Yaoi" },
  { id: "62", title: "Yuri" },
];

export const GENRE_MODE_OPTIONS: LabeledOption[] = [
  { id: "and", title: "Match All Selected" },
  { id: "or", title: "Match Any Selected" },
  { id: "exclude", title: "Exclude Selected" },
];

export const ORIGIN_OPTIONS: LabeledOption[] = [
  { id: "1", title: "Chinese" },
  { id: "3", title: "Japanese" },
  { id: "4", title: "English" },
];

export const STATUS_OPTIONS: LabeledOption[] = [
  { id: "-1", title: "All" },
  { id: "0", title: "Ongoing" },
  { id: "1", title: "Completed" },
];

export const CHAPTER_COUNT_OPTIONS: LabeledOption[] = [
  { id: "0", title: "Any" },
  { id: "1,49", title: "Under 50" },
  { id: "50,100", title: "50 - 100" },
  { id: "100,200", title: "100 - 200" },
  { id: "200,500", title: "200 - 500" },
  { id: "500,1000", title: "500 - 1000" },
  { id: "1001,1000000", title: "Over 1000" },
];

export const MIN_RATING_OPTIONS: LabeledOption[] = [
  { id: "0", title: "Any" },
  { id: "1", title: "1+" },
  { id: "2", title: "2+" },
  { id: "3", title: "3+" },
  { id: "4", title: "4+" },
  { id: "5", title: "5" },
];

export const SORT_OPTIONS: LabeledOption[] = [
  { id: "rank-top", title: "Rank" },
  { id: "date", title: "Last Updated" },
  { id: "rating-score-top", title: "Rating" },
  { id: "today-view", title: "Views Today" },
  { id: "monthly-view", title: "Views This Month" },
  { id: "total-view", title: "Total Views" },
  { id: "bookmark", title: "Bookmarks" },
  { id: "review", title: "Reviews" },
  { id: "comment", title: "Comments" },
  { id: "chapter-count-most", title: "Chapter Count" },
  { id: "abc", title: "Title (A-Z)" },
  { id: "cba", title: "Title (Z-A)" },
];

export interface FeedDefinition {
  id: string;
  title: string;
  /** Builds the listing path for a 1-based page number. */
  path: (page: number) => string;
}

const advancedSearchFeed = (sort: string, status = "-1") => (page: number) =>
  `/search-adv?ctgcon=and&totalchapter=0&ratcon=min&rating=0&status=${status}&sort=${sort}&tagcon=and&page=${page}`;

/** Home page feeds, in display order. Unknown feed keys fall back to the first entry. */
export const FEEDS: FeedDefinition[] = [
  { id: "trending", title: "Trending Today", path: advancedSearchFeed("today-view") },
  { id: "latest", title: "Latest Releases", path: (page) => `/latest-release-novels?page=${page}` },
  { id: "popular", title: "Most Popular", path: advancedSearchFeed("rank-top") },
  { id: "top_rated", title: "Top Rated", path: advancedSearchFeed("rating-score-top") },
  { id: "new", title: "New Novels", path: (page) => `/genre-all/sort-new/status-all/all-novel?page=${page}` },
  { id: "completed", title: "Completed", path: advancedSearchFeed("rank-top", "1") },
];
