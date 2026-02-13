export interface JSONSchema {
    homePage: HomePage;
}

export interface MangaPageResponse {
    mangaPage: MangaPage;
}

export interface HomePage {
    sections: Section[];
}

export interface Section {
    type?:        string;
    layout?:      string;
    key:          string;
    items?:       Item[];
    content?:     Content;
    title?:       string;
    seeMoreHref?: string;
}

export interface Content {
    title:       string;
    articleHtml: string;
}

export interface Item {
    id:                   string;
    title:                string;
    banner?:              string;
    href?:                string;
    synopsis?:            string;
    description?:         string;
    summary?:             string;
    tags?:                string[];
    plaiceholder?:        string;
    color?:               string;
    image?:               string;
    initiallyBookmarked?: boolean;
    type?:                Type;
    slug?:                string;
    chapter?:             ChapterInfo;
}

export interface ChapterInfo {
    title?: string;
}

export enum Type {
    Manga = "Manga",
    Manhua = "Manhua",
    Manwha = "Manwha",
}

export interface MangaPage {
    id:                    string;
    authors:               Author[];
    banner:                Banner;
    genres:                Tag[];
    englishTitle:          string;
    poster:                Poster;
    isInitiallyBookmarked: boolean;
    title:                 string;
    type:                  Type;
    otherNames:            any[];
    synopsis:              string;
    anilistId:             string;
    mangaBakaId:           string;
    malId:                 string;
    mangaUpdatesId:        string;
    status:                string;
    recommendations:       Recommendation[];
    chapters:              Chapter[];
    startReading:          StartReading;
}

export interface Author {
    name: string;
    slug: string;
}

export interface Banner {
    url:         string;
    aspectRatio: number;
}

export interface Chapter {
    id:        string;
    number:    number;
    title:     string;
    createdAt: Date;
    index:     number;
    pageCount: number;
    progress:  null;
}

export interface Poster {
    id:           string;
    color:        string;
    plaiceholder: string;
    image:        string;
}

export interface Recommendation {
    plaiceholder:        string;
    id:                  string;
    title:               string;
    color:               string;
    image:               string;
    initiallyBookmarked: boolean;
    type:                Type;
}

export interface StartReading {
    label:  string;
    legend: string;
    href:   string;
}

export interface Tag {
    id:   string;
    name: string;
}

export interface SearchResponse {
    facet_counts:   any[];
    found:          number;
    hits:           Hit[];
    out_of:         number;
    page:           number;
    request_params: RequestParams;
    search_cutoff:  boolean;
    search_time_ms: number;
}

export interface Hit {
    document:        Document;
    highlight:       Highlight;
    highlights:      HighlightElement[];
    text_match:      number;
    text_match_info: TextMatchInfo;
}

export interface Document {
    englishTitle?: string;
    id:            string;
    poster:        string;
    title:         string;
}

export interface Highlight {
    title: TitleHighlight;
}

export interface TitleHighlight {
    matched_tokens: string[];
    snippet:        string;
}

export interface HighlightElement {
    field:          string;
    matched_tokens: string[];
    snippet:        string;
}

export interface TextMatchInfo {
    best_field_score:   string;
    best_field_weight:  number;
    fields_matched:     number;
    num_tokens_dropped: number;
    score:              string;
    tokens_matched:     number;
    typo_prefix_score:  number;
}

export interface RequestParams {
    collection_name: string;
    first_q:         string;
    per_page:        number;
    q:               string;
}
