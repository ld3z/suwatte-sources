import { NetworkClientBuilder, NetworkRequest } from "@suwatte/daisuke";
import { BASE_URL } from "./constants";

export interface SimpleNetworkClient {
  get(url: string, config?: NetworkRequest): Promise<string>;
}

// Build a manga ID from hash
export function buildMangaId(hashId: string): string {
  return hashId;
}

// Parse a manga ID to get the hash
export function parseMangaId(contentId: string): { hashId: string } {
  return { hashId: contentId };
}

// Build a chapter ID 
export function buildChapterId(chapterId: number): string {
  return chapterId.toString();
}

// Parse a chapter ID
export function parseChapterId(chapterId: string): { chapterId: string } {
  return { chapterId };
}

// Create network client with proper configuration
export class NetworkClient implements SimpleNetworkClient {
  private client = new NetworkClientBuilder()
    .setRateLimit(5, 1) // 5 requests per second
    .build();

  async get(url: string, config?: NetworkRequest): Promise<string> {
    const headers = {
      Referer: `${BASE_URL}/`,
      ...(config?.headers || {}),
    };

    const request: NetworkRequest = {
      url,
      headers,
      ...config,
    };

    const response = await this.client.request(request);
    return response.data;
  }
}

// Helper to parse poster quality
export function getPosterUrl(
  poster: { small: string; medium: string; large: string },
  quality?: string
): string {
  switch (quality) {
    case "small":
      return poster.small;
    case "medium":
      return poster.medium;
    case "large":
    default:
      return poster.large;
  }
}

// Helper to generate star rating display
export function generateStarRating(ratingAvg: number): string {
  if (!ratingAvg || ratingAvg === 0) return "";

  // Convert 0-10 rating to 0-5 stars
  const stars = Math.round(ratingAvg / 2);
  const filledStars = "★".repeat(stars);
  const emptyStars = "☆".repeat(5 - stars);
  
  // Format the rating number (remove unnecessary decimals)
  const ratingStr = ratingAvg % 1 === 0 
    ? ratingAvg.toString() 
    : ratingAvg.toFixed(1).replace(/\.0$/, "");

  return `${filledStars}${emptyStars} ${ratingStr}`;
}

// Helper to clean and format chapter number
export function formatChapterNumber(num: number): string {
  return num % 1 === 0 ? num.toString() : num.toString();
}