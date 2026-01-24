/**
 * Popular manga wrapper from most_viewed_series.json
 */
export interface PopularWrapper {
    most_viewed_series: MangaDto[];
}

/**
 * Manga DTO from the popular JSON response
 */
export interface MangaDto {
    title: string;
    url: string;
    image: string;
}

/**
 * Parsed manga details from HTML
 */
export interface MangaDetails {
    title: string;
    cover: string;
    synopsis: string;
    genres: string[];
    artist?: string;
    status: string;
    url: string;
}

/**
 * Parsed chapter info
 */
export interface ChapterInfo {
    title: string;
    url: string;
    dateText: string;
}
