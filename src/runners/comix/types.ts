// Comix API Response Types

export interface Term {
  term_id: number;
  type: string;
  title: string;
  slug: string;
  count?: number;
}

export interface Poster {
  small: string;
  medium: string;
  large: string;
}

export interface Manga {
  hash_id: string;
  title: string;
  alt_titles: string[];
  synopsis?: string;
  type: string; // "manga", "manhwa", "manhua", "other"
  poster: Poster;
  status: string; // "releasing", "on_hiatus", "finished", "discontinued", "not_yet_released"
  is_nsfw: boolean;
  author?: Term[];
  artist?: Term[];
  genre?: Term[];
  theme?: Term[];
  demographic?: Term[];
  rated_avg?: number;
}

export interface Pagination {
  current_page: number;
  last_page: number;
}

export interface SearchResponse {
  result: {
    items: Manga[];
    pagination: Pagination;
  };
}

export interface SingleMangaResponse {
  result: Manga;
}

export interface ScanlationGroup {
  name: string;
}

export interface Chapter {
  chapter_id: number;
  scanlation_group_id: number;
  number: number;
  name?: string;
  votes: number;
  updated_at: number; // Unix timestamp in seconds
  scanlation_group?: ScanlationGroup;
}

export interface ChapterListResponse {
  result: {
    items: Chapter[];
    pagination: Pagination;
  };
}

export interface ChapterDataResponse {
  result?: {
    chapter_id: number;
    images: string[];
  };
}

// Filter types
export interface FilterState {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: string[];
  type?: string[];
  demographic?: { [key: string]: "include" | "exclude" | "ignore" };
  genre?: { [key: string]: "include" | "exclude" | "ignore" };
  yearFrom?: string;
  yearTo?: string;
  minChapters?: number;
  hideNsfw?: boolean;
}