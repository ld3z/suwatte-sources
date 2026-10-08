import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://lunarx.to";
export const API_URL = "https://api.lunarx.to";
export const SEARCH_LIMIT = 30;

export const SORT_OPTIONS: LabeledOption[] = [
  { id: "relevance", title: "Relevance" },
  { id: "popular", title: "Popular" },
  { id: "title", title: "Title" },
  { id: "year", title: "Release Year" },
];
export const DEFAULT_SORT = "relevance";

export const STATUS_OPTIONS: LabeledOption[] = [
  { id: "", title: "Any" },
  { id: "ongoing", title: "Ongoing" },
  { id: "completed", title: "Completed" },
  { id: "hiatus", title: "Hiatus" },
];

export const CONTENT_OPTIONS: LabeledOption[] = [
  { id: "safe", title: "Safe" },
  { id: "suggestive", title: "Suggestive" },
  { id: "explicit", title: "Explicit" },
];

/** Fallback genres; the live list comes from `/api/novels/db/search/facets`. */
export const GENRE_OPTIONS: LabeledOption[] = [
  "action", "adventure", "comedy", "drama", "fantasy", "historical", "horror",
  "isekai", "josei", "mature", "mystery", "psychological", "romance", "seinen",
  "shoujo", "shounen", "slice of life", "supernatural", "thriller", "tragedy",
].map((name) => ({ id: name, title: titleCase(name) }));

export function titleCase(text: string): string {
  return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export interface FeedDefinition {
  id: string;
  title: string;
  /** Order for the mirrored catalog's `/api/novels/genres` listing. */
  order: string;
}

/** Home page feeds, in display order. Unknown feed keys fall back to the first entry. */
export const FEEDS: FeedDefinition[] = [
  { id: "popular", title: "Popular", order: "popular" },
  { id: "updates", title: "Latest Updates", order: "updates" },
  { id: "new", title: "New Novels", order: "new" },
];
