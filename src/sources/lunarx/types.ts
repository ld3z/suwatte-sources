/** Novel from the mirrored catalog (`/api/novels/genres`, `/api/novels/home`). */
export interface ProviderNovelItem {
  slug: string;
  title: string;
  chapters?: string;
  cover_url?: string;
  rank?: number | null;
  rating?: number | null;
}

export interface ProviderListResponse {
  message?: string;
  data?: {
    novels?: ProviderNovelItem[];
    page?: number;
    /** Text such as "21528 novels (estimated)". */
    total_novels?: string | number;
    total_pages?: number;
  };
}

/** `/api/novels?slug=`; missing novels come back as "Error fetching novel" with 0 chapters. */
export interface ProviderNovelResponse {
  novel?: {
    slug: string;
    title: string;
    alternative_title?: string;
    author?: string;
    chapters?: string;
    status?: string;
    genres?: string[];
    cover_url?: string;
    description?: string;
  };
}

export interface ProviderChapterResponse {
  chapter?: {
    chapter_number: number;
    chapter_title?: string;
    content?: string;
  };
}

/** Mirrored catalog search endpoint (`/api/novels/search?q=...&page=...`). */
export interface ProviderSearchResultItem {
  id?: number;
  title: string;
  author?: string;
  slug: string;
  rank?: number;
  status?: string;
  genres?: string[];
  cover_path?: string;
  latest_chapter_number?: number;
}

export interface ProviderSearchResponse {
  message?: string;
  results?: {
    novels?: ProviderSearchResultItem[];
    query?: string;
    result_count?: number;
    current_page?: number;
    total_pages?: number;
    has_next_page?: boolean;
    has_prev_page?: boolean;
  };
}

/** Novel from Lunar's own database (`/api/novels/db/search`, `/api/novels/title/{slug}`). JSON arrays arrive as strings. */
export interface DbNovel {
  slug: string;
  title: string;
  alternative_titles?: string | null;
  author?: string | null;
  artist?: string | null;
  content_level?: string | null;
  cover_url?: string | null;
  description?: string | null;
  genres?: string | null;
  themes?: string | null;
  original_language?: string | null;
  publication_status?: string | null;
  publication_year?: number | null;
  publisher?: string | null;
}

export interface DbSearchResponse {
  novels?: DbNovel[];
  page?: number;
  total?: number;
  total_pages?: number;
}

export interface DbFacetsResponse {
  tags?: { name: string; count: number }[];
}

export interface VolumeItem {
  volume: number;
  volume_display?: string;
  title?: string;
  file_size?: number;
  file_url?: string | null;
  uploaded_at?: number;
  language?: string;
  points_price?: number | null;
  kofi_locked?: boolean;
  is_coming_soon?: boolean;
}

export interface VolumesResponse {
  count?: number;
  slug?: string;
  success?: boolean;
  volumes?: VolumeItem[];
}

export interface DbChapterItem {
  chapter: number;
  chapter_title?: string;
  language?: string;
  uploaded_at?: number;
  is_coming_soon?: boolean;
}

export interface DbChaptersResponse {
  count?: number;
  slug?: string;
  chapters?: DbChapterItem[];
}
