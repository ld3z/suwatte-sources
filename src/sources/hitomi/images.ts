import { CDN_DOMAIN, THUMB_URL } from "./constants";
import { HitomiFile, HitomiFlag, ImageServerRules } from "./types";

export function isSet(flag: HitomiFlag): boolean {
  return flag === 1 || flag === "1";
}

/**
 * Reads gg.js without evaluating it. The script is a `switch` over image ids
 * whose groups of `case N:` labels each end in `o = K; break;`.
 */
export function parseImageServerRules(script: string): ImageServerRules {
  const basePath = /\bb:\s*'([^']*)'/.exec(script)?.[1];
  if (basePath === undefined) {
    throw new Error("Hitomi's image server script no longer defines a base path.");
  }
  const defaultOffset = parseInt(/var\s+o\s*=\s*(\d+)/.exec(script)?.[1] ?? "0", 10);

  const offsets = new Map<number, number>();
  const switchBody = /switch\s*\(g\)\s*\{([\s\S]*?)\n\}/.exec(script)?.[1] ?? "";
  let pending: number[] = [];
  for (const match of switchBody.matchAll(/case\s+(\d+):|o\s*=\s*(\d+)\s*;\s*break;/g)) {
    if (match[1] !== undefined) {
      pending.push(parseInt(match[1], 10));
    } else {
      const offset = parseInt(match[2], 10);
      for (const id of pending) offsets.set(id, offset);
      pending = [];
    }
  }
  return { basePath, offsets, defaultOffset };
}

/** gg.s: the last three hex digits, reordered as `[last][two before]`, in decimal. */
export function imageIdFromHash(hash: string): number {
  const m = /(..)(.)$/.exec(hash);
  return m ? parseInt(m[2] + m[1], 16) : 0;
}

export function imageUrl(
  file: HitomiFile,
  rules: ImageServerRules,
  format: "webp" | "avif"
): string {
  const ext = format === "avif" && isSet(file.hasavif) ? "avif" : "webp";
  const imageId = imageIdFromHash(file.hash);
  const offset = rules.offsets.get(imageId) ?? rules.defaultOffset;
  const host = `${ext === "avif" ? "a" : "w"}${1 + offset}.${CDN_DOMAIN}`;
  return `https://${host}/${rules.basePath}${imageId}/${file.hash}.${ext}`;
}

export function thumbnailUrl(file?: HitomiFile): string {
  if (!file?.hash) return "";
  const path = file.hash.replace(/^.*(..)(.)$/, `$2/$1/${file.hash}`);
  return `${THUMB_URL}/webpbigtn/${path}.webp`;
}
