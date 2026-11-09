/** Flags arrive as `1`, `"1"`, `""` or missing depending on the gallery's age. */
export type HitomiFlag = number | string | null | undefined;

export interface HitomiFile {
  hash: string;
  name: string;
  width: number;
  height: number;
  hasavif?: HitomiFlag;
  haswebp?: HitomiFlag;
}

export interface HitomiTag {
  tag: string;
  url?: string;
  female?: HitomiFlag;
  male?: HitomiFlag;
}

export interface HitomiGallery {
  id: number | string;
  title: string;
  japanese_title?: string | null;
  type?: string | null;
  language?: string | null;
  language_localname?: string | null;
  date?: string | null;
  datepublished?: string | null;
  galleryurl?: string | null;
  blocked?: HitomiFlag;
  files: HitomiFile[];
  tags?: HitomiTag[] | null;
  artists?: { artist: string }[] | null;
  groups?: { group: string }[] | null;
  parodys?: { parody: string }[] | null;
  characters?: { character: string }[] | null;
  related?: number[] | null;
}

/** The parts of gg.js needed to place an image on its CDN host. */
export interface ImageServerRules {
  /** Leading path segment, e.g. `1794196801/`. */
  basePath: string;
  /** Subdomain offsets for the listed image ids; unlisted ids use `defaultOffset`. */
  offsets: Map<number, number>;
  defaultOffset: number;
}
