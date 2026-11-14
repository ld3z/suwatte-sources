export interface HentaiFoxTagEntry {
  name: string;
  slug: string;
  count?: number;
}

export interface HentaiFoxPageSpec {
  page: number;
  ext: string;
  width?: number;
  height?: number;
}

export interface ParsedListingCard {
  id: string;
  title: string;
  coverImage?: string;
  category?: string;
  /** Numeric language IDs from `data-languages`, when present. */
  languageIds?: string[];
  language?: string;
}

export interface ParsedListingResult {
  items: ParsedListingCard[];
  total?: number;
  hasNextPage: boolean;
  csrfToken?: string;
}

export interface ParsedGalleryDetail {
  id: string;
  title: string;
  coverImage: string;
  category?: string;
  languages: HentaiFoxTagEntry[];
  tags: HentaiFoxTagEntry[];
  artists: HentaiFoxTagEntry[];
  groups: HentaiFoxTagEntry[];
  parodies: HentaiFoxTagEntry[];
  characters: HentaiFoxTagEntry[];
  pageCount: number;
  postedText?: string;
  likes?: number;
  dislikes?: number;
  favorites?: number;
  downloads?: number;
  imageBaseUrl: string;
  pages: HentaiFoxPageSpec[];
  related: ParsedListingCard[];
}
