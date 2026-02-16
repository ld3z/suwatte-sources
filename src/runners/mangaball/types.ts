// MangaBall API Response Types
// Matches the JSON structures from Dto.kt

export interface Pagination {
    current_page: number;
    last_page: number;
}

export interface SearchResponse {
    data: SearchManga[];
    pagination: Pagination;
}

export interface SearchManga {
    url: string;      // e.g. "/title-detail/some-slug-12345"
    name: string;
    cover: string;    // full image URL
    isAdult: boolean;
}

export interface ChapterListResponse {
    ALL_CHAPTERS: ChapterContainer[];
}

export interface ChapterContainer {
    number_float: number;
    translations: ChapterTranslation[];
}

export interface ChapterTranslation {
    id: string;
    name: string;
    language: string;
    group: TranslationGroup;
    date: string;     // "yyyy-MM-dd HH:mm:ss"
    volume: number;
}

export interface TranslationGroup {
    _id: string;
    name: string;
}

export interface SmartSearchResponse {
    code: number;
    message: string;
    data: {
        manga: SmartSearchManga[];
        authors: string;
        tags: string;
    };
}

export interface SmartSearchManga {
    url: string;      // e.g. "/title-detail/some-slug-12345"
    title: string;
    img: string;      // full image URL
    rating: number;
    views: number;
    followers: number;
    status: string;   // HTML string
}

export interface Yoast {
    "@graph": YoastGraph[];
}

export interface YoastGraph {
    "@type": string;
    url?: string;
}
