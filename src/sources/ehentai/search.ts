import { SearchRequest } from "@suwatte/toolchain";

import {
  ALL_CATEGORIES_MASK,
  ALL_LANGUAGES,
  CATEGORIES,
  MIN_RATING_ANY,
} from "./constants";
import { Preferences } from "./settings";

export const EH_NAMESPACES = [
  "language",
  "parody",
  "character",
  "group",
  "artist",
  "cosplayer",
  "male",
  "female",
  "mixed",
  "other",
  "reclass",
  "temp",
  "tag",
  "uploader",
] as const;

export type EHNamespace = (typeof EH_NAMESPACES)[number];

const NAMESPACE_ALIASES: Record<string, EHNamespace> = {
  language: "language",
  languages: "language",
  l: "language",
  parody: "parody",
  parodies: "parody",
  series: "parody",
  p: "parody",
  character: "character",
  characters: "character",
  c: "character",
  group: "group",
  groups: "group",
  circle: "group",
  g: "group",
  artist: "artist",
  artists: "artist",
  a: "artist",
  cosplayer: "cosplayer",
  cosplayers: "cosplayer",
  cos: "cosplayer",
  male: "male",
  m: "male",
  female: "female",
  f: "female",
  mixed: "mixed",
  x: "mixed",
  other: "other",
  o: "other",
  reclass: "reclass",
  r: "reclass",
  temp: "temp",
  tag: "tag",
  tags: "tag",
  uploader: "uploader",
};

export interface SearchOptions {
  path: string;
  params: Record<string, string | number>;
}

export type DeepLinkTarget =
  | { kind: "gallery"; id: string }
  | { kind: "reader"; path: string };

export function formatSearchTerm(
  ns: EHNamespace,
  value: string,
  opts?: { negative?: boolean; or?: boolean }
): string {
  const clean = value
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/\$$/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const prefix = opts?.negative ? "-" : opts?.or ? "~" : "";
  if (ns === "uploader") {
    return `${prefix}uploader:${/\s/.test(clean) ? `"${clean}"` : clean}`;
  }
  const lowered = clean.toLowerCase();
  return `${prefix}${ns}:"${lowered}$"`;
}

/**
 * Normalizes user search text so Hitomi/nhentai-style underscore terms
 * (`female:big_breasts`, `-male:yaoi`) become exact E-Hentai `f_search` tokens
 * while preserving native E-Hentai quotes, `$`, and `~` operators.
 */
export function normalizeQueryTokens(rawInput: string): {
  tokens: string[];
  explicitLanguage?: string;
} {
  const normalized = rawInput
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .trim();
  if (!normalized) return { tokens: [] };

  const rawTokens =
    normalized.match(/[-~]?[a-z]+:"[^"]*"|[-~]?"[^"]*"|\S+/gi) ?? [];
  const tokens: string[] = [];
  let explicitLanguage: string | undefined;

  for (const raw of rawTokens) {
    const negative = raw.startsWith("-");
    const orFlag = raw.startsWith("~");
    const body = negative || orFlag ? raw.slice(1) : raw;
    if (!body) continue;

    if (body.startsWith('"') && body.endsWith('"')) {
      tokens.push(raw);
      continue;
    }

    const colon = body.indexOf(":");
    if (colon > 0) {
      const alias = NAMESPACE_ALIASES[body.slice(0, colon).toLowerCase()];
      const rest = body.slice(colon + 1);
      if (alias && rest) {
        const cleanVal = rest
          .replace(/^"|"$/g, "")
          .replace(/\$$/, "")
          .replace(/_/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!cleanVal) continue;
        if (alias === "language" && !negative && !orFlag) {
          explicitLanguage = cleanVal.toLowerCase();
          continue;
        }
        tokens.push(formatSearchTerm(alias, cleanVal, { negative, or: orFlag }));
        continue;
      }
    }

    tokens.push(raw);
  }

  return { tokens, explicitLanguage };
}

function appendCommaFilter(
  tokens: string[],
  rawValue: unknown,
  defaultNs: EHNamespace,
  multiIsOr: boolean
) {
  if (typeof rawValue !== "string") return;
  const positiveEntries: { ns: EHNamespace; value: string }[] = [];

  for (const part of rawValue.split(",")) {
    let text = part.trim();
    if (!text) continue;
    const negative = text.startsWith("-");
    const explicitOr = text.startsWith("~");
    if (negative || explicitOr) text = text.slice(1).trim();

    let ns = defaultNs;
    const colon = text.indexOf(":");
    if (colon > 0) {
      const alias = NAMESPACE_ALIASES[text.slice(0, colon).trim().toLowerCase()];
      const rest = text.slice(colon + 1).trim();
      if (alias && rest) {
        ns = alias;
        text = rest;
      }
    }

    const clean = text
      .replace(/^"|"$/g, "")
      .replace(/\$$/, "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) continue;

    if (negative) {
      tokens.push(formatSearchTerm(ns, clean, { negative: true }));
    } else if (explicitOr) {
      tokens.push(formatSearchTerm(ns, clean, { or: true }));
    } else {
      positiveEntries.push({ ns, value: clean });
    }
  }

  if (positiveEntries.length > 1 && multiIsOr) {
    for (const entry of positiveEntries) {
      tokens.push(formatSearchTerm(entry.ns, entry.value, { or: true }));
    }
  } else {
    for (const entry of positiveEntries) {
      tokens.push(formatSearchTerm(entry.ns, entry.value));
    }
  }
}

export function computeCategoryMask(
  filter: { include?: string[]; exclude?: string[] } | undefined,
  prefExcluded: string[]
): number {
  const bitOf = (id: string) =>
    CATEGORIES.find((c) => c.id === id.toLowerCase())?.bit ?? 0;

  const included = filter?.include ?? [];
  const excluded = filter?.exclude ?? [];

  if (included.length > 0) {
    let enabledBits = 0;
    for (const id of included) enabledBits |= bitOf(id);
    for (const id of excluded) enabledBits &= ~bitOf(id);
    return ALL_CATEGORIES_MASK ^ enabledBits;
  }

  let disabledBits = 0;
  for (const id of [...excluded, ...prefExcluded]) {
    disabledBits |= bitOf(id);
  }
  return disabledBits;
}

export function parsePageRange(rawValue: unknown): {
  min?: number;
  max?: number;
} {
  if (typeof rawValue !== "string") return {};
  const text = rawValue.trim();
  if (!text) return {};

  const range = /^(\d+)\s*-\s*(\d+)$/.exec(text);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const gte = /^>=?\s*(\d+)$/.exec(text);
  if (gte) {
    return { min: Number(gte[1]) };
  }
  const lte = /^<=?\s*(\d+)$/.exec(text);
  if (lte) {
    return { max: Number(lte[1]) };
  }
  if (/^\d+$/.test(text)) {
    return { min: Number(text) };
  }
  return {};
}

function appendHiddenTags(tokens: string[], hiddenTags: string[]) {
  const existingPositive = new Set(
    tokens
      .filter((t) => !t.startsWith("-"))
      .map((t) => t.replace(/^~/, "").toLowerCase())
  );
  const existingNegative = new Set(
    tokens.filter((t) => t.startsWith("-")).map((t) => t.toLowerCase())
  );

  for (const entry of hiddenTags) {
    const colon = entry.indexOf(":");
    const ns =
      colon > 0
        ? (NAMESPACE_ALIASES[entry.slice(0, colon)] ?? "tag")
        : "tag";
    const val = colon > 0 ? entry.slice(colon + 1) : entry;
    const posToken = formatSearchTerm(ns, val).toLowerCase();
    const negToken = formatSearchTerm(ns, val, { negative: true });
    if (
      !existingPositive.has(posToken) &&
      !existingNegative.has(negToken.toLowerCase())
    ) {
      tokens.push(negToken);
      existingNegative.add(negToken.toLowerCase());
    }
  }
}

export function buildSearchOptions(
  request: SearchRequest,
  variantLanguage: string,
  prefs: Preferences,
  basePath = "/"
): SearchOptions {
  const { tokens, explicitLanguage } = normalizeQueryTokens(request.query ?? "");
  const filters = (request.filters ?? {}) as Record<string, unknown>;

  appendCommaFilter(tokens, filters.tags, "tag", false);
  appendCommaFilter(tokens, filters.artists, "artist", true);
  appendCommaFilter(tokens, filters.groups, "group", true);
  appendCommaFilter(tokens, filters.parodies, "parody", true);
  appendCommaFilter(tokens, filters.characters, "character", false);
  appendCommaFilter(tokens, filters.uploader, "uploader", false);

  const filterLang =
    typeof filters.language === "string" &&
    filters.language &&
    filters.language !== ALL_LANGUAGES
      ? filters.language.toLowerCase()
      : undefined;

  const effectiveLang = explicitLanguage ?? filterLang ?? variantLanguage;
  if (effectiveLang && effectiveLang !== ALL_LANGUAGES) {
    tokens.push(formatSearchTerm("language", effectiveLang));
  }

  appendHiddenTags(tokens, prefs.hiddenTags);

  const params: Record<string, string | number> = {};
  const fCats = computeCategoryMask(
    filters.category as { include?: string[]; exclude?: string[] } | undefined,
    prefs.excludedCategories
  );
  if (fCats > 0 && fCats < ALL_CATEGORIES_MASK) {
    params.f_cats = fCats;
  }

  if (tokens.length > 0) {
    params.f_search = tokens.join(" ");
  }

  const minRating =
    typeof filters.min_rating === "string" &&
    filters.min_rating !== MIN_RATING_ANY
      ? Number(filters.min_rating)
      : 0;
  const pageRange = parsePageRange(filters.pages);
  const requireTorrent = filters.torrents_only === true;
  const expunged = filters.expunged === true;

  if (
    minRating >= 2 ||
    pageRange.min !== undefined ||
    pageRange.max !== undefined ||
    requireTorrent ||
    expunged
  ) {
    params.advsearch = 1;
    if (minRating >= 2) params.f_srdd = minRating;
    if (pageRange.min !== undefined) params.f_spf = pageRange.min;
    if (pageRange.max !== undefined) params.f_spt = pageRange.max;
    if (requireTorrent) params.f_sto = "on";
    if (expunged) params.f_sh = "on";
  }

  return { path: basePath, params };
}

/**
 * Extracts a gallery `{gid}/{token}` or reader `/s/{ptoken}/{gid}-{page}` path
 * from a pasted E-Hentai or ExHentai URL.
 */
export function parseDeepLink(query: string): DeepLinkTarget | null {
  const text = query.trim();
  if (!text) return null;

  const shortGallery = /^\/?g\/(\d+)\/([0-9a-f]{10})(?:\/|$|[?#])/i.exec(text);
  if (shortGallery) {
    return {
      kind: "gallery",
      id: `${shortGallery[1]}/${shortGallery[2].toLowerCase()}`,
    };
  }

  if (!/(?:e-hentai|exhentai)\.org\//i.test(text)) return null;

  const galleryMatch = /\/g\/(\d+)\/([0-9a-f]{10})(?:\/|$|[?#])/i.exec(text);
  if (galleryMatch) {
    return {
      kind: "gallery",
      id: `${galleryMatch[1]}/${galleryMatch[2].toLowerCase()}`,
    };
  }

  const readerMatch = /(\/s\/[0-9a-f]{10}\/\d+-\d+)/i.exec(text);
  if (readerMatch) {
    return { kind: "reader", path: readerMatch[1] };
  }

  return null;
}
