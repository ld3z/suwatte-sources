import { ContentRating, SourceInfo } from "@suwatte/toolchain";
import { BASE_URL } from "./constants";

export const info: SourceInfo = {
  id: "en.ldez.madokami",
  name: "Madokami",
  version: 1.0,
  website: BASE_URL,
  languages: ["en"],
  rating: ContentRating.MATURE,
  thumbnail: "madokami.png",
};
