export interface IMHentaiTagEntry {
  name: string;
  altName?: string;
  slug: string;
  count?: number;
}

export interface IMHentaiPageSpec {
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
  language?: string;
}

export interface ParsedListingResult {
  items: ParsedListingCard[];
  total?: number;
  hasNextPage: boolean;
}

export interface ParsedGalleryDetail {
  id: string;
  title: string;
  subtitle?: string;
  coverImage: string;
  category?: string;
  languages: IMHentaiTagEntry[];
  tags: IMHentaiTagEntry[];
  artists: IMHentaiTagEntry[];
  groups: IMHentaiTagEntry[];
  parodies: IMHentaiTagEntry[];
  characters: IMHentaiTagEntry[];
  pageCount: number;
  postedText?: string;
  likes?: number;
  dislikes?: number;
  favorites?: number;
  imageBaseUrl: string;
  pages: IMHentaiPageSpec[];
  related: ParsedListingCard[];
}
