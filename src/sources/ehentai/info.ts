import { ContentRating, SourceInfo, SourceVariant } from "@suwatte/toolchain";
import { ALL_LANGUAGES, EH_BASE_URL, LANGUAGES, SOURCE_CONFIG } from "./constants";

export const info: SourceInfo = {
  id: "all.ldez.ehentai",
  name: "E-Hentai",
  version: 1.0,
  website: EH_BASE_URL,
  languages: LANGUAGES.map((l) => l.code),
  rating: ContentRating.MATURE,
  thumbnail: "ehentai.jxl",
};

export interface EHentaiArgs {
  /** E-Hentai language tag name, or "all". */
  language: string;
}

/** One artifact per site language, plus one spanning all languages. */
export const variants: SourceVariant[] = [
  {
    id: info.id,
    name: "E-Hentai (All)",
    languages: info.languages,
    config: SOURCE_CONFIG,
    args: { language: ALL_LANGUAGES },
  },
  ...LANGUAGES.map((l) => ({
    id: `${l.code}.ldez.ehentai`,
    name: `E-Hentai (${l.title})`,
    languages: [l.code],
    config: SOURCE_CONFIG,
    args: { language: l.name },
  })),
];
