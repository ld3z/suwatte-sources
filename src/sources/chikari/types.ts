export interface ChikariSeriesItem {
  id: number;
  slug: string;
  title: string;
  type?: string;
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

export interface ChikariSeriesListResponse {
  items: ChikariSeriesItem[];
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

export interface ChikariSeries extends ChikariSeriesItem {
  description?: string;
  year?: number | null;
  banner_url?: string | null;
  /** `strip` for long-strip titles; anything else is paged. */
  reading_mode?: string;
  genres?: ChikariGenre[];
  tags?: ChikariTag[];
  authors?: ChikariAuthor[];
  alt_titles?: string[] | null;
  anilist_id?: number | null;
  mal_id?: number | null;
  kitsu_id?: number | null;
  mangaupdates_id?: string | null;
}

export interface ChikariScan {
  slug: string;
  name: string;
  created_at?: string;
}

export interface ChikariChapter {
  number: number;
  volume?: string;
  title?: string;
  lang?: string;
  created_at?: string;
  /** Scan groups that uploaded this chapter; empty for the site's own uploads. */
  scans?: ChikariScan[];
}

export interface ChikariChapterListResponse {
  items: ChikariChapter[];
  total: number;
  limit: number;
  offset: number;
  scan_groups?: ChikariScan[];
}

export interface ChikariChapterRead {
  number: number;
  title?: string;
  pages?: string[];
  scan?: string;
  scan_name?: string;
  /** True when the requested scan group was missing and another was returned. */
  scan_fallback?: boolean;
}
