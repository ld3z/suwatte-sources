export interface EHentaiGMetadata {
  gid: number;
  token: string;
  title: string;
  title_jpn?: string;
  category: string;
  thumb: string;
  uploader?: string;
  posted: string;
  filecount: string;
  filesize: number;
  expunged: boolean;
  rating: string;
  torrentcount?: string;
  tags: string[];
  parent_gid?: string;
  parent_key?: string;
  first_gid?: string;
  first_key?: string;
  error?: string;
}

export interface EHentaiGDataResponse {
  gmetadata?: EHentaiGMetadata[];
  error?: string;
}

export interface ParsedListingItem {
  id: string;
  gid: number;
  token: string;
  title: string;
  coverImage?: string;
  category?: string;
  rating?: number;
  pages?: number;
  tags: string[];
}

export interface ParsedListingPage {
  items: ParsedListingItem[];
  total?: number;
  nextCursor?: string;
  hasNextPage: boolean;
}

export interface ParsedGalleryPage {
  gid: string;
  token: string;
  title: string;
  japaneseTitle?: string;
  coverImage: string;
  category?: string;
  uploader?: string;
  posted?: string;
  language?: string;
  fileSize?: string;
  pageCount: number;
  favorites?: number;
  rating?: number;
  summary?: string;
  tagsByNamespace: Map<string, string[]>;
  relatedRefs: { gid: number; token: string }[];
  viewerUrls: Map<number, string>;
  totalThumbPages: number;
}

export interface ResolvedReaderImage {
  imageUrl: string;
  fullImageUrl?: string;
  nlToken?: string;
  fetchedAt: number;
}
