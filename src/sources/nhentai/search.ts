import { SearchRequest } from "@suwatte/toolchain";

import {
  ALL_LANGUAGES,
  CATEGORIES,
  SORTS,
  SortKey,
  UPLOADED_ANY,
} from "./constants";

export const TAG_NAMESPACES = [
  "tag",
  "artist",
  "group",
  "parody",
  "character",
  "language",
  "category",
] as const;

export type TagNamespace = (typeof TAG_NAMESPACES)[number];

const NAMESPACE_ALIASES: Record<string, TagNamespace> = {
  tag: "tag",
  tags: "tag",
  female: "tag",
  male: "tag",
  artist: "artist",
  artists: "artist",
  group: "group",
  groups: "group",
  parody: "parody",
  parodies: "parody",
  series: "parody",
  character: "character",
  characters: "character",
  language: "language",
  languages: "language",
  category: "category",
  categories: "category",
  type: "category",
};

const SPECIAL_PREFIXES = new Set(["pages", "favorites", "uploaded"]);

export interface Term {
  ns: TagNamespace;
  value: string;
}

export interface ParsedQuery {
  positive: Term[];
  negative: Term[];
  /** Keywords, exact phrases, and numeric/date filters (`pages:>=20`, `uploaded:<7d`). */
  rawTokens: string[];
  /** A positive `language:` term overrides the variant's language. */
  language?: string;
}

export type EffectiveQuery =
  | { kind: "all" }
  | { kind: "singleTag"; term: Term; query: string }
  | { kind: "search"; query: string };

export function emptyQuery(): ParsedQuery {
  return { positive: [], negative: [], rawTokens: [] };
}

export function sortById(id?: string): SortKey {
  return SORTS.find((s) => s.id === id)?.id ?? SORTS[0].id;
}

export function formatQueryTerm(
  ns: TagNamespace,
  value: string,
  negative = false
): string {
  const clean = value.trim().toLowerCase().replace(/"/g, "");
  const formatted = /\s/.test(clean) ? `"${clean}"` : clean;
  return `${negative ? "-" : ""}${ns}:${formatted}`;
}

function addNamespaceTerm(query: ParsedQuery, term: Term, negative: boolean) {
  if (term.ns === "language" && !negative) {
    query.language = term.value;
    return;
  }
  (negative ? query.negative : query.positive).push(term);
}

/**
 * Parses nhentai's search syntax (`tag:"big breasts"`, `-artist:name`,
 * `"exact phrase"`, `pages:>=20`, `uploaded:<7d`) as well as underscore-joined
 * and Hitomi-style terms (`female:big_breasts`, `series:touhou_project`).
 */
export function parseQueryString(
  input: string,
  into: ParsedQuery = emptyQuery()
): ParsedQuery {
  const normalized = input
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .trim();
  if (!normalized) return into;

  const tokens = normalized.match(/-?[a-z]+:"[^"]*"|-?"[^"]*"|\S+/gi) ?? [];
  for (const raw of tokens) {
    const negative = raw.startsWith("-");
    const body = negative ? raw.slice(1) : raw;
    if (!body) continue;

    if (body.startsWith('"') && body.endsWith('"') && body.length >= 2) {
      const phrase = body.slice(1, -1).trim();
      if (phrase) into.rawTokens.push(`${negative ? "-" : ""}"${phrase}"`);
      continue;
    }

    const colon = body.indexOf(":");
    if (colon > 0) {
      const rawPrefix = body.slice(0, colon).toLowerCase();
      const rawVal = body.slice(colon + 1);
      if (SPECIAL_PREFIXES.has(rawPrefix) && rawVal) {
        into.rawTokens.push(`${negative ? "-" : ""}${rawPrefix}:${rawVal.toLowerCase()}`);
        continue;
      }
      const ns = NAMESPACE_ALIASES[rawPrefix];
      if (ns) {
        const value = rawVal
          .replace(/^"|"$/g, "")
          .replace(/_/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (value) {
          addNamespaceTerm(into, { ns, value }, negative);
          continue;
        }
      }
    }

    into.rawTokens.push(raw);
  }

  return into;
}

function addCommaListFilter(
  query: ParsedQuery,
  value: unknown,
  defaultNs: TagNamespace
) {
  if (typeof value !== "string") return;
  for (const part of value.split(",")) {
    let text = part.trim().toLowerCase();
    if (!text) continue;
    const negative = text.startsWith("-");
    if (negative) text = text.slice(1).trim();
    text = text.replace(/^"|"$/g, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;

    let ns = defaultNs;
    const colon = text.indexOf(":");
    if (colon > 0) {
      const alias = NAMESPACE_ALIASES[text.slice(0, colon).trim()];
      const rest = text.slice(colon + 1).replace(/^"|"$/g, "").trim();
      if (alias && rest) {
        ns = alias;
        text = rest;
      }
    }
    addNamespaceTerm(query, { ns, value: text }, negative);
  }
}

export function parsePagesFilter(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const out: string[] = [];
  for (const part of value.split(",")) {
    const text = part.trim().replace(/^pages:/i, "").trim();
    if (!text) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(text);
    if (range) {
      out.push(`pages:>=${range[1]}`, `pages:<=${range[2]}`);
      continue;
    }
    const op = /^(>=|<=|>|<|=)\s*(\d+)$/.exec(text);
    if (op) {
      out.push(`pages:${op[1] === "=" ? "" : op[1]}${op[2]}`);
      continue;
    }
    if (/^\d+$/.test(text)) {
      out.push(`pages:>=${text}`);
    }
  }
  return out;
}

export function hasActiveFilters(filters?: Record<string, unknown>): boolean {
  if (!filters) return false;
  for (const [key, value] of Object.entries(filters)) {
    if (value == null) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (key === "language" && trimmed === ALL_LANGUAGES) continue;
      if (key === "uploaded" && trimmed === UPLOADED_ANY) continue;
      return true;
    }
    if (typeof value === "boolean") {
      if (value) return true;
      continue;
    }
    if (typeof value === "object") {
      const sel = value as { include?: string[]; exclude?: string[] };
      if ((sel.include?.length ?? 0) > 0 || (sel.exclude?.length ?? 0) > 0) {
        return true;
      }
    }
  }
  return false;
}

export function parseSearchRequest(request: SearchRequest): ParsedQuery {
  const query = parseQueryString(request.query ?? "");
  const filters = (request.filters ?? {}) as Record<string, unknown>;

  const categories = filters.category as
    | { include?: string[]; exclude?: string[] }
    | undefined;
  const includedCats = (categories?.include ?? []).map((c) => c.toLowerCase());
  if (includedCats.length === 1) {
    query.positive.push({ ns: "category", value: includedCats[0] });
  } else if (includedCats.length > 1 && includedCats.length < CATEGORIES.length) {
    // Each gallery has one category, so 2-of-3 included equals excluding the rest.
    for (const cat of CATEGORIES) {
      if (!includedCats.includes(cat.id)) {
        query.negative.push({ ns: "category", value: cat.id });
      }
    }
  }
  for (const excluded of categories?.exclude ?? []) {
    query.negative.push({ ns: "category", value: excluded.toLowerCase() });
  }

  addCommaListFilter(query, filters.tags, "tag");
  addCommaListFilter(query, filters.artists, "artist");
  addCommaListFilter(query, filters.groups, "group");
  addCommaListFilter(query, filters.parodies, "parody");
  addCommaListFilter(query, filters.characters, "character");

  query.rawTokens.push(...parsePagesFilter(filters.pages));

  const uploaded = filters.uploaded;
  if (typeof uploaded === "string" && uploaded && uploaded !== UPLOADED_ANY) {
    query.rawTokens.push(`uploaded:${uploaded}`);
  }

  const language = filters.language;
  if (typeof language === "string" && language && language !== ALL_LANGUAGES) {
    query.language = language.toLowerCase();
  }

  return query;
}

function hiddenEntryToTerm(entry: string): Term {
  const colon = entry.indexOf(":");
  if (colon > 0) {
    const ns = NAMESPACE_ALIASES[entry.slice(0, colon)];
    const value = entry.slice(colon + 1).trim();
    if (ns && value) return { ns, value };
  }
  return { ns: "tag", value: entry };
}

export function buildEffectiveQuery(
  parsed: ParsedQuery,
  variantLanguage: string,
  hiddenTags: string[] = []
): EffectiveQuery {
  const positive = [...parsed.positive];
  const negative = [...parsed.negative];
  const effectiveLang = parsed.language ?? variantLanguage;

  if (effectiveLang && effectiveLang !== ALL_LANGUAGES) {
    positive.push({ ns: "language", value: effectiveLang });
  }

  const positiveKeys = new Set(positive.map((t) => `${t.ns}:${t.value}`));
  const seenNegative = new Set(negative.map((t) => `${t.ns}:${t.value}`));

  for (const hidden of hiddenTags) {
    const term = hiddenEntryToTerm(hidden);
    const key = `${term.ns}:${term.value}`;
    if (!positiveKeys.has(key) && !seenNegative.has(key)) {
      negative.push(term);
      seenNegative.add(key);
    }
  }

  if (!positive.length && !negative.length && !parsed.rawTokens.length) {
    return { kind: "all" };
  }

  if (
    positive.length === 1 &&
    !negative.length &&
    !parsed.rawTokens.length
  ) {
    const term = positive[0];
    return {
      kind: "singleTag",
      term,
      query: formatQueryTerm(term.ns, term.value, false),
    };
  }

  const parts = [
    ...parsed.rawTokens,
    ...positive.map((t) => formatQueryTerm(t.ns, t.value, false)),
    ...negative.map((t) => formatQueryTerm(t.ns, t.value, true)),
  ];
  return { kind: "search", query: parts.join(" ") };
}

/**
 * Resolves a gallery ID from an nhentai URL, `#177013`, `id:177013`, `g/177013`,
 * or (when no filters are set) a bare numeric gallery code (`177013`).
 */
export function parseDeepLinkId(
  query: string,
  allowBareNumber = true
): string | null {
  const text = query.trim();
  if (!text) return null;

  const explicit = /^(?:id:\s*|#)(\d{1,8})$/i.exec(text);
  if (explicit && Number(explicit[1]) > 0) return String(Number(explicit[1]));

  const shortPath = /^\/?g\/(\d{1,8})(?:\/|$)/i.exec(text);
  if (shortPath && Number(shortPath[1]) > 0) return String(Number(shortPath[1]));

  if (/nhentai\.net\//i.test(text)) {
    const urlMatch = /\/g\/(\d{1,8})(?:\/|$|[?#])/i.exec(text);
    if (urlMatch && Number(urlMatch[1]) > 0) return String(Number(urlMatch[1]));
    return null;
  }

  if (allowBareNumber && /^[1-9]\d{0,7}$/.test(text)) {
    return text;
  }

  return null;
}
