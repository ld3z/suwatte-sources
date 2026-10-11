import { ContentRating, SourceInfo } from "@suwatte/toolchain";
import { BASE_URL } from "./constants";

export const info: SourceInfo = {
  id: "en.ldez.novelbuddy",
  name: "NovelBuddy",
  version: 1.0,
  website: BASE_URL,
  languages: ["en"],
  rating: ContentRating.MATURE,
  thumbnail: "novelbuddy.png",
};
