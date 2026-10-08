import { ContentRating, SourceInfo } from "@suwatte/toolchain";
import { BASE_URL } from "./constants";

export const info: SourceInfo = {
  id: "en.ldez.lunarx.novels",
  name: "Lunar (Novels)",
  version: 1.4,
  website: `${BASE_URL}/novel`,
  languages: ["en"],
  rating: ContentRating.MATURE,
  thumbnail: "lunarx.png",
};
