export interface ChikariNovelItem {
  id: number;
  slug: string;
  title: string;
  status?: string;
  is_nsfw?: boolean;
  chapter_count?: number;
  cover_url?: string;
  latest_chapter?: number;
  last_chapter_at?: string;
  rating?: number | null;
  rating_count?: number;
  views?: number;
}

export interface ChikariNovelListResponse {
  items: ChikariNovelItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ChikariGenre {
  slug: string;
  name: string;
  count?: number;
}

export interface ChikariTag {
  id: number;
  name: string;
  count?: number;
  is_spoiler?: boolean;
}

export interface ChikariAuthor {
  name: string;
  slug?: string;
  role?: string;
}

export interface ChikariNovel extends ChikariNovelItem {
  description?: string;
  year?: number | null;
  genres?: ChikariGenre[];
  tags?: ChikariTag[];
  authors?: ChikariAuthor[];
  alt_titles?: string[] | null;
}

export interface ChikariChapter {
  number: number;
  volume?: string;
  title?: string;
  lang?: string;
  created_at?: string;
}

export interface ChikariChapterListResponse {
  items: ChikariChapter[];
  total: number;
  limit: number;
  offset: number;
}

export interface ChikariChapterRead extends ChikariChapter {
  body?: string;
  locked?: boolean;
  lock_reason?: string | null;
}
