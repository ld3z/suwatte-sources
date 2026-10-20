import { ContentRating, SourceInfo } from "@suwatte/toolchain";
import { BASE_URL } from "./constants";

export const info: SourceInfo = {
  id: "en.ldez.chikari",
  name: "Chikari",
  version: 1.2,
  website: BASE_URL,
  languages: ["en"],
  rating: ContentRating.MATURE,
  thumbnail: "chikari.jxl",
};
