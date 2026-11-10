import { ContentRating, SourceInfo, SourceVariant } from "@suwatte/toolchain";
import { ALL_LANGUAGES, BASE_URL, LANGUAGES } from "./constants";

export const info: SourceInfo = {
  id: "all.ldez.nhentai",
  name: "nhentai",
  version: 1.0,
  website: BASE_URL,
  languages: LANGUAGES.map((l) => l.code),
  rating: ContentRating.MATURE,
  thumbnail: "nhentai.jxl",
};

export interface NhentaiArgs {
  /** nhentai language tag name, or "all". */
  language: string;
}

/** One artifact per main site language, plus one spanning all languages. */
export const variants: SourceVariant[] = [
  {
    id: info.id,
    name: "nhentai (All)",
    languages: info.languages,
    args: { language: ALL_LANGUAGES },
  },
  ...LANGUAGES.map((l) => ({
    id: `${l.code}.ldez.nhentai`,
    name: `nhentai (${l.title})`,
    languages: [l.code],
    args: { language: l.name },
  })),
];
