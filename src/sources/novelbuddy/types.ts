export interface NovelBuddyResponse<T> {
  success: boolean;
  data: T;
}

export interface NovelBuddyNamed {
  name: string;
  slug: string;
}

export interface NovelBuddyStats {
  views?: number;
  bookmarks_count?: number;
  chapters_count?: number;
}

export interface NovelBuddyTitleItem {
  id: string;
  slug: string;
  name: string;
  cover?: string;
  status?: string;
  rating?: number;
  is_adult?: boolean;
  is_mtl?: boolean;
  stats?: NovelBuddyStats;
}

export interface NovelBuddySearchResponse {
  items: NovelBuddyTitleItem[];
  pagination?: {
    total?: number;
    page?: number;
    has_next?: boolean;
  };
}

export interface NovelBuddyTitle extends NovelBuddyTitleItem {
  summary?: string;
  alt_names?: { name: string }[];
  genres?: NovelBuddyNamed[];
  tags?: NovelBuddyNamed[];
  authors?: NovelBuddyNamed[];
  artists?: NovelBuddyNamed[];
  type?: NovelBuddyNamed | null;
  release_date?: string | null;
  /** Cache version; the chapter list is stale unless it is passed along. */
  cv?: number;
}

export interface NovelBuddyTitleDetails {
  title: NovelBuddyTitle;
}

export interface NovelBuddyChapter {
  id: string;
  slug: string;
  name?: string;
  number?: number | null;
  updated_at?: string;
}

export interface NovelBuddyChapterList {
  chapters: NovelBuddyChapter[];
}

export interface NovelBuddyChapterDetails {
  chapter: NovelBuddyChapter & { content?: string };
}
