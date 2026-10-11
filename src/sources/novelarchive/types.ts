export interface NovelArchiveNovel {
  id: string;
  title: string;
  author?: string;
  /** Comma-separated genre names, e.g. "Action, Fantasy". */
  genres?: string;
  cover_url?: string;
  description?: string;
  associated_names?: string[];
  chapter_names?: string[];
  /** Numeric string, e.g. "3209". */
  total_chapters?: string;
  views_number?: number;
  rating?: number;
  rating_count?: number;
  release_status?: string;
  updated_at?: string;
}

export interface NovelArchiveListResponse {
  novels: NovelArchiveNovel[];
  pagination?: {
    page: number;
    total?: number;
    has_next?: boolean;
  };
}

export interface NovelArchiveNovelResponse {
  novel: NovelArchiveNovel;
}

export interface NovelArchiveChapterResponse {
  chapter: {
    number: number;
    name?: string;
    content?: string;
  };
}

export interface NovelArchiveGenre {
  value: string;
  label: string;
}
