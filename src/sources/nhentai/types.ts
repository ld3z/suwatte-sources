export interface CdnConfig {
  image_servers: string[];
  thumb_servers: string[];
}

export interface NhentaiTagLink {
  id?: number | null;
  service: string;
  label: string;
  url: string;
  handle: string;
}

export interface NhentaiTag {
  id: number;
  type: string;
  name: string;
  slug: string;
  url: string;
  count: number;
  description?: string | null;
  links?: NhentaiTagLink[] | null;
}

export interface NhentaiGalleryTitle {
  english: string;
  japanese?: string | null;
  pretty: string;
}

export interface NhentaiCoverInfo {
  path: string;
  width: number;
  height: number;
}

export interface NhentaiPageInfo {
  number: number;
  path: string;
  width: number;
  height: number;
  thumbnail: string;
  thumbnail_width: number;
  thumbnail_height: number;
}

export interface NhentaiListItem {
  id: number;
  media_id: string;
  english_title: string;
  japanese_title?: string | null;
  thumbnail: string;
  thumbnail_width: number;
  thumbnail_height: number;
  num_pages?: number;
  num_favorites?: number;
  tag_ids?: number[];
  blacklisted?: boolean;
}

export interface NhentaiGalleryDetail {
  id: number;
  media_id: string;
  title: NhentaiGalleryTitle;
  cover: NhentaiCoverInfo;
  thumbnail: NhentaiCoverInfo;
  scanlator?: string;
  upload_date: number;
  tags: NhentaiTag[];
  num_pages: number;
  num_favorites: number;
  pages: NhentaiPageInfo[];
  related?: NhentaiListItem[] | null;
}

export interface NhentaiPaginatedResponse {
  result: NhentaiListItem[];
  num_pages: number;
  per_page?: number;
  total?: number | null;
}
