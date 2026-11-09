import { ContentRating, SourceInfo, SourceVariant } from "@suwatte/toolchain";
import { ALL_LANGUAGES, BASE_URL, LANGUAGES } from "./constants";

export const info: SourceInfo = {
  id: "all.ldez.hitomi",
  name: "Hitomi",
  version: 1.0,
  website: BASE_URL,
  languages: LANGUAGES.map((l) => l.code),
  rating: ContentRating.MATURE,
  thumbnail: "hitomi.jxl",
};

export interface HitomiArgs {
  /** Hitomi language name used in nozomi paths, or "all". */
  language: string;
}

/** One artifact per site language, plus one spanning every language. */
export const variants: SourceVariant[] = [
  {
    id: info.id,
    name: "Hitomi (All)",
    languages: info.languages,
    args: { language: ALL_LANGUAGES },
  },
  ...LANGUAGES.map((l) => ({
    id: `${l.code}.ldez.hitomi`,
    name: `Hitomi (${l.title})`,
    languages: [l.code],
    args: { language: l.name },
  })),
];
