// WeebDex API Response Types

export interface MangaListResponse {
  data: Manga[];
  limit: number;
  page: number;
  total: number;
}

export interface Manga {
  id: string;
  title: string;
  alt_titles: { [language: string]: string[] };
  description: string;
  content_rating: string;
  status: string;
  demographic?: "shounen" | "shoujo" | "josei" | "seinen" | "none";
  language: string;
  year?: number;
  last_chapter?: string;
  last_volume?: string;
  chapter_numbers_reset_on_new_volume: boolean;
  created_at: string;
  updated_at: string;
  published_at?: string;
  deleted_at?: string;
  state?: string;
  relationships: MangaRelationships;
}

export interface MangaRelationships {
  authors?: AuthorArtist[];
  artists?: AuthorArtist[];
  cover?: CoverArt;
  tags?: Tag[];
  available_languages?: string[];
  available_groups?: string[];
  stats?: MangaStats;
  links?: { [key: string]: string };
  relations?: RelatedManga[];
  thread?: Thread;
}

export interface AuthorArtist {
  id: string;
  name: string;
  group: string;
}

export interface CoverArt {
  id: string;
  ext: string;
  dimensions?: [number, number];
}

export interface Tag {
  id: string;
  name: string;
  group: string;
}

export interface MangaStats {
  follows?: number;
  rating?: {
    average: number;
    bayesian: number;
    distribution: number[];
  };
  replies?: number;
}

export interface RelatedManga {
  id: string;
  title: string;
  type: "main_story" | "adapted_from" | "prequel" | "sequel" | "side_story" | "spin_off" | "alternate_story" | "alternate_version" | "doujinshi" | "colored" | "preserialization" | "serialization";
  content_rating?: string;
  status?: string;
  demographic?: string;
  year?: number;
  alt_titles?: { [language: string]: string[] };
  description?: string;
  language?: string;
  relationships?: {
    cover?: CoverArt;
    tags?: Tag[];
  };
}

export interface Thread {
  id: string;
  locked: boolean;
}

export interface ChapterListResponse {
  data: Chapter[];
  limit: number;
  page: number;
  total: number;
  map?: {
    manga?: { [id: string]: Manga };
  };
}

export interface Chapter {
  id: string;
  chapter?: string;
  volume?: string;
  title?: string;
  language: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  state?: "draft" | "submitted" | "published" | "rejected";
  data: PageImage[];
  data_optimized: PageImage[];
  node: string;
  relationships: ChapterRelationships;
}

export interface PageImage {
  name: string;
  dimensions: [number, number];
}

export interface ChapterRelationships {
  manga?: Manga;
  groups?: ScanlationGroup[];
  uploader?: User;
  stats?: ChapterStats;
  thread?: Thread;
}

export interface ScanlationGroup {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  avatar_url?: string;
}

export interface ChapterStats {
  replies?: number;
  up?: number;
}

export interface AggregatedChapterResponse {
  chapters: AggregatedVolume[];
  groups: ScanlationGroup[];
  languages: string[];
}

export interface AggregatedVolume {
  volume?: string;
  chapter: string;
  entries: { [chapterId: string]: ChapterEntry };
}

export interface ChapterEntry {
  language: number;
  groups: number[];
  published_at: string;
}

export interface TagListResponse {
  data: Tag[];
  limit: number;
  page: number;
  total: number;
}

export interface AuthorListResponse {
  data: AuthorArtist[];
  limit: number;
  page: number;
  total: number;
}

export interface GroupListResponse {
  data: ScanlationGroup[];
  limit: number;
  page: number;
  total: number;
}

export interface UserListResponse {
  data: User[];
  limit: number;
  page: number;
  total: number;
}

// Internal types for the runner
export interface ParsedMangaId {
  id: string;
}

export interface ParsedChapterId {
  mangaId: string;
  chapterId: string;
  language?: string;
}