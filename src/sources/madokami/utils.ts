import { BASE_URL } from "./constants";

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function absoluteUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http")) return url;
  return url.startsWith("/") ? `${BASE_URL}${url}` : `${BASE_URL}/${url}`;
}

/** Strips the site origin so ids stay site-relative paths. */
export function toPath(href: string): string {
  return href.startsWith(BASE_URL) ? href.slice(BASE_URL.length) : href;
}

export function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The title is the last path segment that isn't a `!`-prefixed sub-folder. */
export function titleFromPath(path: string): string {
  const segments = path.split("/");
  let i = segments.length;
  do {
    i--;
  } while (i > 0 && safeDecode(segments[i]).startsWith("!"));
  return safeDecode(segments[i] ?? "");
}

/**
 * Series pages live at a fixed depth: `/Manga/{letter}/{xx}/{xxxx}/{title}`
 * for manga, and the folder above any `!`-prefixed sub-folders for raws.
 */
export function detailsPath(contentId: string): string {
  const segments = contentId.split("/").filter(Boolean);

  if (segments.length > 5 && segments[0] === "Manga" && segments[1].length === 1) {
    return `/${segments.slice(0, 5).join("/")}`;
  }

  if (segments.length > 2 && segments[0] === "Raws") {
    while (segments.length > 2 && safeDecode(segments[segments.length - 1]).startsWith("!")) {
      segments.pop();
    }
    return `/${segments.join("/")}`;
  }

  return contentId;
}

export function nonEmpty<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

/** Base64 of the UTF-8 bytes of `input`; `btoa`/`Buffer` aren't guaranteed in the app runtime. */
export function base64Encode(input: string): string {
  const bytes: number[] = [];
  for (const char of input) {
    const cp = char.codePointAt(0)!;
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    }
  }

  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    output += BASE64_ALPHABET[(triple >> 18) & 0x3f];
    output += BASE64_ALPHABET[(triple >> 12) & 0x3f];
    output += b === undefined ? "=" : BASE64_ALPHABET[(triple >> 6) & 0x3f];
    output += c === undefined ? "=" : BASE64_ALPHABET[triple & 0x3f];
  }
  return output;
}

export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${base64Encode(`${username}:${password}`)}`;
}
