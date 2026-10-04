import { LabeledOption } from "@suwatte/toolchain";

export const BASE_URL = "https://lnori.com";
export const PAGE_SIZE = 30;

/** How long the full library listing is reused before refetching. */
export const LIBRARY_CACHE_MS = 60 * 60 * 1000;

export const PREF_SHOW_ILLUSTRATIONS = "pref_show_illustrations";

export const SUGGESTIVE_TAGS = ["mature", "ecchi", "fanservice"];

export const SORT_OPTIONS: LabeledOption[] = [
  { id: "popular", title: "Popularity" },
  { id: "title", title: "Title" },
  { id: "year", title: "Year Released" },
  { id: "volumes", title: "Volumes" },
];

/** Feed id for the home page's seasonal anime section, whose title changes each season. */
export const FEED_SEASONAL = "seasonal";

export interface LibraryFeed {
  id: string;
  title: string;
  sort: string;
}

/** Home page feeds built from the library listing, in display order. */
export const LIBRARY_FEEDS: LibraryFeed[] = [
  { id: "popular", title: "Popular", sort: "popular" },
  { id: "newest", title: "Newest Releases", sort: "year" },
  { id: "most_volumes", title: "Most Volumes", sort: "volumes" },
];
