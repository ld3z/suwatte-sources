export interface AtsumaruImageObject {
  image?: string;
  largeImage?: string;
  mediumImage?: string;
  smallImage?: string;
}

export interface AtsumaruAuthor {
  id?: string;
  name: string;
  slug?: string;
  type?: "Author" | "Artist" | string;
}

export interface AtsumaruGenre {
  id: string | number;
  name: string;
  weight?: string;
}

export interface AtsumaruTag {
  id: string | number;
  name: string;
  group?: string;
  adult?: boolean;
  safeCount?: number;
  adultCount?: number;
}

export interface AtsumaruScanlator {
  id: string;
  name: string;
  score?: number;
  myVote?: unknown;
}

export interface AtsumaruBrowseItem {
  id: string;
  title: string;
  englishTitle?: string;
  image?: string;
  smallImage?: string;
  mediumImage?: string;
  largeImage?: string;
  poster?: string | AtsumaruImageObject;
  isAdult?: boolean;
  type?: string;
  medium?: string;
  mbRating?: number;
  views?: string | number;
  createdAt?: number;
  updatedAt?: number;
  chapterCount?: number;
}

export interface AtsumaruBrowseResponse {
  items: AtsumaruBrowseItem[];
}

export interface AtsumaruSearchHit {
  document: AtsumaruBrowseItem & {
    authors?: string[];
    otherNames?: string[];
    synopsis?: string;
    genres?: string[];
    tags?: string[];
  };
}

export interface AtsumaruSearchResponse {
  page?: number;
  found?: number;
  hits?: AtsumaruSearchHit[];
  items?: AtsumaruBrowseItem[];
  request_params?: {
    per_page?: number;
  };
}

export interface AtsumaruMangaPage {
  id: string;
  title: string;
  englishTitle?: string;
  otherNames?: string[];
  synopsis?: string;
  released?: number;
  status?: string;
  type?: string;
  medium?: string;
  isAdult?: boolean;
  mbContentRating?: string;
  avgRating?: number;
  views?: string | number;
  image?: string;
  smallImage?: string;
  mediumImage?: string;
  largeImage?: string;
  poster?: string | AtsumaruImageObject;
  banner?: string;
  authors?: AtsumaruAuthor[];
  genres?: AtsumaruGenre[];
  tags?: AtsumaruTag[];
  scanlators?: AtsumaruScanlator[];
  recommendations?: AtsumaruBrowseItem[];
  similarManga?: AtsumaruBrowseItem[];
  anilistId?: string | number;
  malId?: string | number;
  kitsuId?: string | number;
  annId?: string | number;
  mangaUpdatesId?: string | number;
  kenmeiUrl?: string;
}

export interface AtsumaruMangaPageResponse {
  mangaPage: AtsumaruMangaPage;
}

export interface AtsumaruChapterItem {
  id: string;
  title?: string;
  number: number;
  scanlationMangaId?: string;
  createdAt?: number;
  index?: number;
  pageCount?: number;
}

export interface AtsumaruAllChaptersResponse {
  chapters: AtsumaruChapterItem[];
}

export interface AtsumaruReadPage {
  id?: string;
  image: string;
  number?: number;
  width?: number;
  height?: number;
  aspectRatio?: number;
}

export interface AtsumaruReadChapter {
  id: string;
  title?: string;
  scanlationMangaId?: string;
  pages: AtsumaruReadPage[];
}

export interface AtsumaruReadChapterResponse {
  readChapter: AtsumaruReadChapter;
}

export interface AtsumaruAvailableFilters {
  genres?: AtsumaruGenre[];
  tags?: AtsumaruTag[];
  types?: { id: string; name: string }[];
  statuses?: { id: string; name: string }[];
}
