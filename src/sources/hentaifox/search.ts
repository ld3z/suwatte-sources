import { SearchRequest } from "@suwatte/toolchain";

import {
  ALL_LANGUAGES,
  SORTS,
  SortKey,
  languageByName,
  normalizeCategoryId,
} from "./constants";
import { Preferences } from "./settings";

export const TAXONOMY_NAMESPACES = [
  "tag",
  "parody",
  "artist",
  "character",
  "group",
  "category",
  "language",
] as const;

export type TaxonomyNamespace = (typeof TAXONOMY_NAMESPACES)[number];

const NAMESPACE_ALIASES: Record<string, TaxonomyNamespace> = {
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
  ns: TaxonomyNamespace;
  value: string;
  negative: boolean;
}

export type SearchRoute =
  | {
      kind: "get";
      path: string;
      params?: Record<string, string | number>;
    }
  | {
      kind: "sidebar";
      type: string;
    };

export type DeepLinkTarget =
  | { kind: "gallery"; id: string }
  | { kind: "random" };

export function sortById(id?: string): SortKey {
  return SORTS.find((s) => s.id === id)?.id ?? SORTS[0].id;
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

/** Formats a browse/search token for HentaiFox's `+term -term` query syntax. */
export function formatSearchToken(
  value: string,
  negative = false,
  quoted = false
): string {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/^"|"$/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  const body = quoted || clean.includes(" ") ? `"${clean}"` : clean;
  return `${negative ? "-" : "+"}${body}`;
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
  defaultNs: Exclude<TaxonomyNamespace, "language" | "category">
) {
  if (typeof rawValue !== "string") return;
  for (const part of rawValue.split(",")) {
    let text = part.trim();
    if (!text) continue;
    const negative = text.startsWith("-");
    if (negative || text.startsWith("+")) text = text.slice(1).trim();

    let ns: AdvTerm["ns"] = defaultNs;
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

function addHiddenTags(advTerms: AdvTerm[], hiddenTags: string[]) {
  const positiveSet = new Set(
    advTerms.filter((t) => !t.negative).map((t) => `${t.ns}:${t.value}`)
  );
  const existingSet = new Set(
    advTerms.map((t) => `${t.negative ? "-" : "+"}${t.ns}:${t.value}`)
  );

  for (const entry of hiddenTags) {
    const colon = entry.indexOf(":");
    const ns: AdvTerm["ns"] =
      colon > 0 &&
      (TAXONOMY_NAMESPACES as readonly string[]).includes(entry.slice(0, colon))
        ? (entry.slice(0, colon) as AdvTerm["ns"])
        : "tag";
    const value = colon > 0 ? entry.slice(colon + 1).trim() : entry.trim();
    if (!value) continue;
    if (ns === "language" || ns === "category") continue;
    if (positiveSet.has(`${ns}:${value}`)) continue;
    const negKey = `-${ns}:${value}`;
    if (existingSet.has(negKey)) continue;
    existingSet.add(negKey);
    advTerms.push({ ns, value, negative: true });
  }
}

/**
 * Appends HentaiFox's quirky page path:
 * - homepage page 2 uses `/page/2/`
 * - other browse paths use `/pag/{n}/`
 * - search query strings use `&page={n}`
 */
export function withPage(path: string, page: number): string {
  if (page <= 1) return path;
  if (path.includes("?")) {
    return `${path}${path.endsWith("?") || path.endsWith("&") ? "" : "&"}page=${page}`;
  }
  const normalized = path.endsWith("/") ? path : `${path}/`;
  if (normalized === "/" && page === 2) return "/page/2/";
  return `${normalized}pag/${page}/`;
}

function browsePath(
  effectiveLang: string,
  sort: SortKey,
  page: number
): SearchRoute {
  const sortDef = SORTS.find((s) => s.id === sort);
  if (sortDef?.sidebar) {
    return { kind: "sidebar", type: sortDef.sidebar };
  }

  const wantPopular = sortDef?.browse === "popular";
  let path: string;
  if (effectiveLang === ALL_LANGUAGES) {
    // Site has no global `/popular/` — homepage is the all-languages catalogue.
    path = "/";
  } else if (wantPopular) {
    path = `/language/${effectiveLang}/popular/`;
  } else {
    path = `/language/${effectiveLang}/`;
  }
  return { kind: "get", path: withPage(path, page) };
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

  addHiddenTags(parsed.advTerms, prefs.hiddenTags);

  const hasKeywords = parsed.keywords.length > 0;
  const hasAdvTerms = parsed.advTerms.length > 0;
  const hasAnyCategoryFilter =
    includedCats.length > 0 ||
    excludedCats.length > 0 ||
    prefs.excludedCategories.length > 0;

  const sortDef = SORTS.find((s) => s.id === sort);
  if (
    sortDef?.sidebar &&
    !hasKeywords &&
    !hasAdvTerms &&
    !hasAnyCategoryFilter &&
    effectiveLang === ALL_LANGUAGES
  ) {
    return { kind: "sidebar", type: sortDef.sidebar };
  }

  // Clean language / root browse when nothing else is selected.
  if (!hasKeywords && !hasAdvTerms && !hasAnyCategoryFilter) {
    return browsePath(effectiveLang, sort, page);
  }

  // Single positive taxonomy term → `/tag/{slug}/[popular/]`.
  if (
    !hasKeywords &&
    !hasAnyCategoryFilter &&
    parsed.advTerms.length === 1 &&
    !parsed.advTerms[0].negative &&
    (sort === "lt" || sort === "pp") &&
    effectiveLang === ALL_LANGUAGES
  ) {
    const single = parsed.advTerms[0];
    const slug = slugifyTaxonomy(single.value);
    if (slug && single.ns !== "language" && single.ns !== "category") {
      const suffix = sort === "pp" ? "popular/" : "";
      return {
        kind: "get",
        path: withPage(`/${single.ns}/${slug}/${suffix}`, page),
      };
    }
  }

  // Single included category with no other filters.
  if (
    !hasKeywords &&
    !hasAdvTerms &&
    includedCats.length === 1 &&
    excludedCats.length === 0 &&
    prefs.excludedCategories.length === 0 &&
    (sort === "lt" || sort === "pp") &&
    effectiveLang === ALL_LANGUAGES
  ) {
    const suffix = sort === "pp" ? "popular/" : "";
    return {
      kind: "get",
      path: withPage(`/category/${includedCats[0]}/${suffix}`, page),
    };
  }

  // Speechless-only browse.
  if (
    effectiveLang === "speechless" &&
    !hasKeywords &&
    !hasAdvTerms &&
    !hasAnyCategoryFilter
  ) {
    const suffix = sort === "pp" ? "popular/" : "";
    return {
      kind: "get",
      path: withPage(`/language/speechless/${suffix}`, page),
    };
  }

  // HentaiFox search: `+term -term` joined with `+`, language name appended for scoped variants.
  const tokens: string[] = [];
  for (const kw of parsed.keywords) {
    const tok = formatSearchToken(kw, false, kw.includes(" "));
    if (tok) tokens.push(tok);
  }
  for (const term of parsed.advTerms) {
    // Site search matches bare tag/artist names better than `tag:name` tokens.
    const tok = formatSearchToken(term.value, term.negative, true);
    if (tok) tokens.push(tok);
  }
  for (const cat of includedCats) {
    const tok = formatSearchToken(cat.replace(/-/g, " "), false, true);
    if (tok) tokens.push(tok);
  }
  for (const cat of [
    ...excludedCats,
    ...prefs.excludedCategories.filter((c) => !includedCats.includes(c)),
  ]) {
    const tok = formatSearchToken(cat.replace(/-/g, " "), true, true);
    if (tok) tokens.push(tok);
  }

  if (effectiveLang !== ALL_LANGUAGES && languageByName(effectiveLang)) {
    tokens.push(formatSearchToken(effectiveLang, false, false));
  } else if (effectiveLang === "speechless") {
    tokens.push(formatSearchToken("speechless", false, false));
  }

  const params: Record<string, string | number> = {
    // Space-separated +/- tokens; the HTTP client encodes spaces as '+'.
    q: tokens.join(" "),
  };
  if (sort === "pp") params.sort = "popular";
  if (page > 1) params.page = page;

  return { kind: "get", path: "/search/", params };
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
 * Resolves a gallery ID from a `hentaifox.com/gallery/{id}/` or `/g/{id}/{page}/`
 * URL, `#12345`, `id:12345`, `random`, or (when no filters are set) a bare number.
 */
export function parseDeepLink(
  query: string,
  allowBareNumber = true
): DeepLinkTarget | null {
  const text = query.trim();
  if (!text) return null;

  if (
    /^random$/i.test(text) ||
    /hentaifox\.com\/random\/?(?:$|[?#])/i.test(text)
  ) {
    return { kind: "random" };
  }

  const explicit = /^(?:id:\s*|#)(\d{1,9})$/i.exec(text);
  if (explicit && Number(explicit[1]) > 0) {
    return { kind: "gallery", id: String(Number(explicit[1])) };
  }

  const shortPath = /^\/?(?:gallery|g)\/(\d{1,9})(?:\/|$)/i.exec(text);
  if (shortPath && Number(shortPath[1]) > 0) {
    return { kind: "gallery", id: String(Number(shortPath[1])) };
  }

  if (/hentaifox\.com\//i.test(text)) {
    const match = /\/(?:gallery|g)\/(\d{1,9})(?:\/|$|[?#])/i.exec(text);
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
