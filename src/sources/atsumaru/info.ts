import { ContentRating, SourceInfo } from "@suwatte/toolchain";
import { BASE_URL } from "./constants";

export const info: SourceInfo = {
  id: "en.ldez.atsumaru",
  name: "Atsumaru",
  version: 1.3,
  website: BASE_URL,
  languages: ["en"],
  rating: ContentRating.MATURE,
  thumbnail: "atsumaru.png",
};
