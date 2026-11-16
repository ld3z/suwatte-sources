import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://dynasty-scans.com";

/** Tags that make a title unsuitable for younger readers. */
export const MATURE_TAG_IDS = [
  "moderate_amounts_of_sex",
  "large_amounts_of_sex",
  "nsfw",
  "porn",
  "lolicon",
  "shotacon",
];

export const SUGGESTIVE_TAG_IDS = ["ecchi", "suggestive"];

export const DEFAULT_SORT = "best_match";

export const SORT_OPTIONS: LabeledOption[] = [
  { id: "best_match", title: "Best Match" },
  { id: "name", title: "Alphabetical" },
  { id: "created_at", title: "Date Added" },
  { id: "released_on", title: "Release Date" },
];

/** Search classes that return readable content. Author/Tag/Pairing rows are not titles. */
export const DEFAULT_CLASSES = ["Series", "Doujin"];

export const CLASS_OPTIONS: LabeledOption[] = [
  { id: "Series", title: "Series" },
  { id: "Doujin", title: "Doujin" },
  { id: "Anthology", title: "Anthology" },
  { id: "Issue", title: "Issue" },
  { id: "Chapter", title: "Chapter" },
];

export interface FeedDefinition {
  id: string;
  title: string;
  /** Listing path (`/`, `/chapters/added`) for non-search feeds. */
  path?: string;
  /** Search sort key for search-backed feeds. */
  sort?: string;
  /** Home feeds render chapter cards; `/chapters/added` and search render entry rows. */
  parseEntries?: boolean;
}

/** Home page feeds, in display order. Unknown keys fall back to the first entry. */
export const FEEDS: FeedDefinition[] = [
  { id: "latest", title: "Latest Updates", path: "/" },
  { id: "added", title: "Recently Added", path: "/chapters/added", parseEntries: true },
  { id: "new_series", title: "New Series", sort: "created_at", parseEntries: true },
  { id: "directory", title: "Series Directory", sort: "name", parseEntries: true },
];
