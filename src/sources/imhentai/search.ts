import { SearchRequest } from "@suwatte/toolchain";

import {
  ALL_LANGUAGES,
  CATEGORIES,
  LANGUAGES,
  SORTS,
  SortKey,
  languageByName,
  normalizeCategoryId,
} from "./constants";
import { Preferences } from "./settings";

export const ADV_NAMESPACES = [
  "tag",
  "parody",
  "artist",
  "character",
  "group",
] as const;

export type AdvNamespace = (typeof ADV_NAMESPACES)[number];

const NAMESPACE_ALIASES: Record<string, AdvNamespace | "language" | "category"> = {
  tag: "tag",
  tags: "tag",
  female: "tag",
  male: "tag",
  parody: "parody",
  parodies: "parody",
  series: "parody",
  artist: "artist",
  artists: "artist",
  character: "character",
  characters: "character",
  group: "group",
  groups: "group",
  circle: "group",
  language: "language",
  languages: "language",
  category: "category",
  categories: "category",
  type: "category",
};

export interface AdvTerm {
  ns: AdvNamespace;
  value: string;
  negative: boolean;
}

export interface SearchRoute {
  path: string;
  params: Record<string, string | number>;
}

export type DeepLinkTarget =
  | { kind: "gallery"; id: string }
  | { kind: "random" };

export function sortById(id?: string): SortKey {
  return SORTS.find((s) => s.id === id)?.id ?? SORTS[0].id;
}

export function formatAdvToken(term: AdvTerm): string {
  const clean = term.value
    .trim()
    .toLowerCase()
    .replace(/^"|"$/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${term.negative ? "-" : "+"}${term.ns}:"${clean}"`;
}

export function slugifyTaxonomy(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface ParsedInput {
  advTerms: AdvTerm[];
  keywords: string[];
  explicitLanguage?: string;
  includedCategories: string[];
  excludedCategories: string[];
}

function parseQueryInput(rawQuery: string): ParsedInput {
  const out: ParsedInput = {
    advTerms: [],
    keywords: [],
    includedCategories: [],
    excludedCategories: [],
  };
  const normalized = rawQuery
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .trim();
  if (!normalized) return out;

  const tokens =
    normalized.match(/[-+]?[a-z]+:"[^"]*"|[-+]?"[^"]*"|[^,\s]+/gi) ?? [];

  for (const raw of tokens) {
    const negative = raw.startsWith("-");
    const positivePrefix = raw.startsWith("+");
    const body = negative || positivePrefix ? raw.slice(1) : raw;
    if (!body) continue;

    const colon = body.indexOf(":");
    if (colon > 0) {
      const alias = NAMESPACE_ALIASES[body.slice(0, colon).toLowerCase()];
      const rawVal = body
        .slice(colon + 1)
        .replace(/^"|"$/g, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      if (alias && rawVal) {
        if (alias === "language") {
          if (!negative) out.explicitLanguage = rawVal;
          continue;
        }
        if (alias === "category") {
          const catId = normalizeCategoryId(rawVal);
          if (catId) {
            (negative ? out.excludedCategories : out.includedCategories).push(
              catId
            );
          }
          continue;
        }
        out.advTerms.push({ ns: alias, value: rawVal, negative });
        continue;
      }
    }

    if (negative) {
      const val = body
        .replace(/^"|"$/g, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (val) out.advTerms.push({ ns: "tag", value: val, negative: true });
      continue;
    }

    const cleanKeyword = body
      .replace(/^"|"$/g, "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleanKeyword) out.keywords.push(cleanKeyword);
  }

  return out;
}

function addCommaAdvTerms(
  target: AdvTerm[],
  rawValue: unknown,
  defaultNs: AdvNamespace
) {
  if (typeof rawValue !== "string") return;
  for (const part of rawValue.split(",")) {
    let text = part.trim();
    if (!text) continue;
    const negative = text.startsWith("-");
    if (negative || text.startsWith("+")) text = text.slice(1).trim();

    let ns: AdvNamespace = defaultNs;
    const colon = text.indexOf(":");
    if (colon > 0) {
      const alias = NAMESPACE_ALIASES[text.slice(0, colon).trim().toLowerCase()];
      const rest = text.slice(colon + 1).trim();
      if (
        alias &&
        alias !== "language" &&
        alias !== "category" &&
        rest
      ) {
        ns = alias;
        text = rest;
      }
    }

    const clean = text
      .replace(/^"|"$/g, "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (clean) {
      target.push({ ns, value: clean, negative });
    }
  }
}

function addSortFlags(params: Record<string, string | number>, sort: SortKey) {
  for (const s of SORTS) {
    params[s.id] = s.id === sort ? 1 : 0;
  }
}

function addCategoryFlags(
  params: Record<string, string | number>,
  included: string[],
  excluded: string[],
  prefExcluded: string[]
): boolean {
  let hasCustomFilter = false;
  for (const cat of CATEGORIES) {
    let enabled: boolean;
    if (included.length > 0) {
      enabled = included.includes(cat.id) && !excluded.includes(cat.id);
    } else {
      enabled =
        !excluded.includes(cat.id) && !prefExcluded.includes(cat.id);
    }
    if (!enabled) hasCustomFilter = true;
    params[cat.param] = enabled ? 1 : 0;
  }
  return hasCustomFilter;
}

function addLanguageFlags(
  params: Record<string, string | number>,
  effectiveLang: string
) {
  const target = languageByName(effectiveLang);
  for (const lang of LANGUAGES) {
    params[lang.param] = !target || target.name === lang.name ? 1 : 0;
  }
}

function addHiddenTags(advTerms: AdvTerm[], hiddenTags: string[]) {
  const positiveSet = new Set(
    advTerms
      .filter((t) => !t.negative)
      .map((t) => `${t.ns}:${t.value}`)
  );
  const existingSet = new Set(
    advTerms.map((t) => `${t.negative ? "-" : "+"}${t.ns}:${t.value}`)
  );

  for (const entry of hiddenTags) {
    const colon = entry.indexOf(":");
    const ns: AdvNamespace =
      colon > 0 &&
      (ADV_NAMESPACES as readonly string[]).includes(entry.slice(0, colon))
        ? (entry.slice(0, colon) as AdvNamespace)
        : "tag";
    const value = colon > 0 ? entry.slice(colon + 1).trim() : entry.trim();
    if (!value) continue;
    if (positiveSet.has(`${ns}:${value}`)) continue;
    const negKey = `-${ns}:${value}`;
    if (existingSet.has(negKey)) continue;
    existingSet.add(negKey);
    advTerms.push({ ns, value, negative: true });
  }
}

export function buildSearchRoute(
  request: SearchRequest,
  variantLanguage: string,
  sort: SortKey,
  page: number,
  prefs: Preferences
): SearchRoute {
  const parsed = parseQueryInput(request.query ?? "");
  const filters = (request.filters ?? {}) as Record<string, unknown>;

  const catFilter = filters.category as
    | { include?: string[]; exclude?: string[] }
    | undefined;
  const includedCats = [
    ...parsed.includedCategories,
    ...(catFilter?.include ?? [])
      .map(normalizeCategoryId)
      .filter((c): c is string => !!c),
  ];
  const excludedCats = [
    ...parsed.excludedCategories,
    ...(catFilter?.exclude ?? [])
      .map(normalizeCategoryId)
      .filter((c): c is string => !!c),
  ];

  addCommaAdvTerms(parsed.advTerms, filters.tags, "tag");
  addCommaAdvTerms(parsed.advTerms, filters.parodies, "parody");
  addCommaAdvTerms(parsed.advTerms, filters.artists, "artist");
  addCommaAdvTerms(parsed.advTerms, filters.characters, "character");
  addCommaAdvTerms(parsed.advTerms, filters.groups, "group");

  const filterLang =
    typeof filters.language === "string" &&
    filters.language &&
    filters.language !== ALL_LANGUAGES
      ? filters.language.toLowerCase()
      : undefined;
  const speechlessToggle = filters.speechless === true;
  const effectiveLang = speechlessToggle
    ? "speechless"
    : (parsed.explicitLanguage ?? filterLang ?? variantLanguage);

  // Speechless is browsed via its dedicated taxonomy path `/language/speechless/`.
  if (
    effectiveLang === "speechless" &&
    !parsed.keywords.length &&
    !parsed.advTerms.length &&
    !includedCats.length &&
    !excludedCats.length
  ) {
    const suffix = sort === "pp" ? "popular/" : "";
    const params: Record<string, number> = {};
    if (page > 1) params.page = page;
    return { path: `/language/speechless/${suffix}`, params };
  }

  addHiddenTags(parsed.advTerms, prefs.hiddenTags);

  const hasKeywords = parsed.keywords.length > 0;
  const hasAdvTerms = parsed.advTerms.length > 0;
  const hasAnyCategoryFilter =
    includedCats.length > 0 ||
    excludedCats.length > 0 ||
    prefs.excludedCategories.length > 0;

  // Clean root / language / single-taxonomy path when no search/hidden/category flags are needed.
  if (!hasKeywords && !hasAdvTerms && !hasAnyCategoryFilter) {
    if (effectiveLang === ALL_LANGUAGES) {
      const rootPath = SORTS.find((s) => s.id === sort)?.rootPath ?? "/home/";
      const params: Record<string, number> = {};
      if (page > 1) params.page = page;
      return { path: rootPath, params };
    }
    if (sort === "lt" || sort === "pp") {
      const suffix = sort === "pp" ? "popular/" : "";
      const params: Record<string, number> = {};
      if (page > 1) params.page = page;
      return { path: `/language/${effectiveLang}/${suffix}`, params };
    }
  }

  // Single positive taxonomy term on `All` variant with `lt` or `pp` sort can use `/tag/{slug}/[popular/]`.
  if (
    !hasKeywords &&
    !hasAnyCategoryFilter &&
    effectiveLang === ALL_LANGUAGES &&
    parsed.advTerms.length === 1 &&
    !parsed.advTerms[0].negative &&
    (sort === "lt" || sort === "pp")
  ) {
    const single = parsed.advTerms[0];
    const slug = slugifyTaxonomy(single.value);
    if (slug) {
      const suffix = sort === "pp" ? "popular/" : "";
      const params: Record<string, number> = {};
      if (page > 1) params.page = page;
      return { path: `/${single.ns}/${slug}/${suffix}`, params };
    }
  }

  const params: Record<string, string | number> = {};
  addSortFlags(params, sort);
  addCategoryFlags(params, includedCats, excludedCats, prefs.excludedCategories);
  addLanguageFlags(params, effectiveLang);
  params.apply = "Search";
  if (page > 1) params.page = page;

  // Note: IMHentai's `/advsearch/` only parses `+/-ns:"val"` tokens, whereas `/search/`
  // parses comma-separated keyword/title/tag phrases. When keywords are typed, convert
  // positive tag terms into comma-separated `/search/` terms; otherwise use `/advsearch/`
  // when structured `+/-ns:"val"` terms are present.
  if (hasKeywords || !hasAdvTerms) {
    const positiveTagValues = parsed.advTerms
      .filter((t) => !t.negative)
      .map((t) => t.value);
    params.key = [...parsed.keywords, ...positiveTagValues].join(",");
    return { path: "/search/", params };
  }

  params.key = parsed.advTerms.map(formatAdvToken).join(" ");
  return { path: "/advsearch/", params };
}

export function hasActiveFilters(filters?: Record<string, unknown>): boolean {
  if (!filters) return false;
  for (const [key, val] of Object.entries(filters)) {
    if (val == null) continue;
    if (typeof val === "boolean") {
      if (val) return true;
      continue;
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) continue;
      if (key === "language" && trimmed === ALL_LANGUAGES) continue;
      return true;
    }
    if (typeof val === "object") {
      const sel = val as { include?: string[]; exclude?: string[] };
      if ((sel.include?.length ?? 0) > 0 || (sel.exclude?.length ?? 0) > 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves a gallery ID from an `imhentai.xxx/gallery/{id}/` or `/view/{id}/{page}/`
 * URL, `#12345`, `id:12345`, `random`, or (when no filters are set) a bare number.
 */
export function parseDeepLink(
  query: string,
  allowBareNumber = true
): DeepLinkTarget | null {
  const text = query.trim();
  if (!text) return null;

  if (/^random$/i.test(text) || /imhentai\.xxx\/random\/?(?:$|[?#])/i.test(text)) {
    return { kind: "random" };
  }

  const explicit = /^(?:id:\s*|#)(\d{1,9})$/i.exec(text);
  if (explicit && Number(explicit[1]) > 0) {
    return { kind: "gallery", id: String(Number(explicit[1])) };
  }

  const shortPath = /^\/?(?:gallery|view)\/(\d{1,9})(?:\/|$)/i.exec(text);
  if (shortPath && Number(shortPath[1]) > 0) {
    return { kind: "gallery", id: String(Number(shortPath[1])) };
  }

  if (/imhentai\.(?:xxx|com)\//i.test(text)) {
    const match = /\/(?:gallery|view)\/(\d{1,9})(?:\/|$|[?#])/i.exec(text);
    if (match && Number(match[1]) > 0) {
      return { kind: "gallery", id: String(Number(match[1])) };
    }
    return null;
  }

  if (allowBareNumber && /^[1-9]\d{0,8}$/.test(text)) {
    return { kind: "gallery", id: text };
  }

  return null;
}
