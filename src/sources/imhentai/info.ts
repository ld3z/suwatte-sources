import { ContentRating, SourceInfo, SourceVariant } from "@suwatte/toolchain";
import { ALL_LANGUAGES, HOME_URL, LANGUAGES } from "./constants";

export const info: SourceInfo = {
  id: "all.ldez.imhentai",
  name: "IMHentai",
  version: 1.0,
  website: HOME_URL,
  languages: LANGUAGES.map((l) => l.code),
  rating: ContentRating.MATURE,
  thumbnail: "imhentai.jxl",
};

export interface IMHentaiArgs {
  /** IMHentai language name (`english`, `japanese`, ...), or `"all"`. */
  language: string;
}

/** One artifact per supported site language, plus one spanning all languages. */
export const variants: SourceVariant[] = [
  {
    id: info.id,
    name: "IMHentai (All)",
    languages: info.languages,
    args: { language: ALL_LANGUAGES },
  },
  ...LANGUAGES.map((l) => ({
    id: `${l.code}.ldez.imhentai`,
    name: `IMHentai (${l.title})`,
    languages: [l.code],
    args: { language: l.name },
  })),
];
