import { DEFAULT_IMAGE_SERVERS, DEFAULT_THUMB_SERVERS } from "./constants";
import { CdnConfig } from "./types";

export const DEFAULT_CDN: CdnConfig = {
  image_servers: DEFAULT_IMAGE_SERVERS,
  thumb_servers: DEFAULT_THUMB_SERVERS,
};

function shardIndex(key: string | number | undefined, count: number): number {
  if (count <= 1) return 0;
  const numeric = typeof key === "number" ? key : parseInt(String(key ?? ""), 10);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric % count;
  }
  const text = String(key ?? "");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % count;
}

function resolveMediaUrl(
  path: string | undefined | null,
  servers: string[],
  fallbackServers: string[],
  shardKey?: string | number
): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const pool = servers.length > 0 ? servers : fallbackServers;
  const host = pool[shardIndex(shardKey ?? path, pool.length)].replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${host}/${cleanPath}`;
}

export function imageUrl(
  path: string,
  mediaId?: string | number,
  cdn: CdnConfig = DEFAULT_CDN
): string {
  return resolveMediaUrl(path, cdn.image_servers, DEFAULT_IMAGE_SERVERS, mediaId);
}

export function thumbnailUrl(
  path: string | undefined | null,
  mediaId?: string | number,
  cdn: CdnConfig = DEFAULT_CDN
): string {
  return resolveMediaUrl(path, cdn.thumb_servers, DEFAULT_THUMB_SERVERS, mediaId);
}
