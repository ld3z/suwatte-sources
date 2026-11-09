import { SearchRequest } from "@suwatte/toolchain";

import { ALL_LANGUAGES, SORTS, SortDefinition } from "./constants";
import { HitomiIndex, IndexState, NAMESPACES, Namespace, Term, nozomiPath } from "./nozomi";

export interface ParsedQuery {
  positive: Term[];
  negative: Term[];
  /** Each group keeps galleries matching at least one of its terms. */
  anyOf: Term[][];
  /** A `language:` term overrides the variant's language. */
  language?: string;
}

/** Either a single nozomi file that can be paged with byte ranges, or a fully resolved id list. */
export type ResolvedQuery =
  | { kind: "paged"; path: string }
  | { kind: "ids"; ids: number[] };

export function emptyQuery(): ParsedQuery {
  return { positive: [], negative: [], anyOf: [] };
}

export function sortById(id?: string): SortDefinition {
  return SORTS.find((s) => s.id === id) ?? SORTS[0];
}

function toTerm(raw: string): Term | null {
  const text = raw.replace(/_/g, " ").trim();
  if (!text) return null;
  const colon = text.indexOf(":");
  if (colon > 0) {
    const ns = text.slice(0, colon) as Namespace;
    const value = text.slice(colon + 1).trim();
    if (NAMESPACES.includes(ns) && value) return { ns, value };
  }
  return { value: text };
}

function addTerm(query: ParsedQuery, term: Term, negative: boolean) {
  if (term.ns === "language" && !negative) {
    query.language = term.value;
    return;
  }
  (negative ? query.negative : query.positive).push(term);
}

/**
 * Parses the site's search syntax: whitespace-separated terms, `_` for spaces
 * inside a term, `-` to exclude, and `a or b` to match either.
 */
export function parseQueryString(input: string, into: ParsedQuery = emptyQuery()): ParsedQuery {
  const terms = input
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((t) => t && !/^(?:sort|order)by(?:key|direction)?:/.test(t));

  let group: Term[] = [];
  terms.forEach((raw, i) => {
    if (raw === "or") return;
    const orPrevious = i > 0 && terms[i - 1] === "or";
    const orNext = i + 1 < terms.length && terms[i + 1] === "or";
    if (orPrevious || orNext) {
      const term = toTerm(raw);
      if (term) group.push(term);
      if (!orNext && group.length) {
        into.anyOf.push(group);
        group = [];
      }
      return;
    }
    const negative = raw.startsWith("-");
    const term = toTerm(negative ? raw.slice(1) : raw);
    if (term) addTerm(into, term, negative);
  });
  if (group.length) into.anyOf.push(group);
  return into;
}

/**
 * Comma-separated entries for one namespace; `-` excludes. Several included
 * entries match any of them. Tags without `female:`/`male:`/`tag:` match all three.
 */
function addListFilter(query: ParsedQuery, value: unknown, ns: Namespace) {
  if (typeof value !== "string") return;
  const included: Term[] = [];
  for (const entry of value.split(",")) {
    let text = entry.trim().toLowerCase();
    if (!text) continue;
    const negative = text.startsWith("-");
    if (negative) text = text.slice(1).trim();

    let terms: Term[];
    const parsed = toTerm(text);
    if (!parsed) continue;
    if (ns === "tag" && parsed.ns && ["female", "male", "tag"].includes(parsed.ns)) {
      terms = [parsed];
    } else if (ns === "tag") {
      terms = (["female", "male", "tag"] as const).map((n) => ({ ns: n, value: text }));
    } else {
      terms = [{ ns, value: text }];
    }

    if (negative) query.negative.push(...terms);
    else if (terms.length > 1) query.anyOf.push(terms);
    else included.push(...terms);
  }
  if (included.length > 1 && ns !== "tag") query.anyOf.push(included);
  else query.positive.push(...included);
}

export function parseSearchRequest(request: SearchRequest): ParsedQuery {
  const query = parseQueryString(request.query ?? "");
  const filters = (request.filters ?? {}) as Record<string, unknown>;

  const types = filters.type as { include?: string[]; exclude?: string[] } | undefined;
  const includedTypes = (types?.include ?? []).map((value) => ({ ns: "type" as const, value }));
  if (includedTypes.length > 1) query.anyOf.push(includedTypes);
  else query.positive.push(...includedTypes);
  for (const value of types?.exclude ?? []) query.negative.push({ ns: "type", value });

  addListFilter(query, filters.tags, "tag");
  addListFilter(query, filters.artists, "artist");
  addListFilter(query, filters.groups, "group");
  addListFilter(query, filters.series, "series");
  addListFilter(query, filters.characters, "character");

  const language = filters.language;
  if (typeof language === "string" && language && language !== ALL_LANGUAGES) {
    query.language = language;
  }
  return query;
}

/** Port of the site's `do_search`: start from the most selective list, then intersect. */
export async function resolveQuery(
  index: HitomiIndex,
  parsed: ParsedQuery,
  state: IndexState
): Promise<ResolvedQuery> {
  const positive = [...parsed.positive].sort((a, b) => Number(!!b.ns) - Number(!!a.ns));
  const { negative, anyOf } = parsed;

  if (!negative.length && !anyOf.length) {
    if (!positive.length) return { kind: "paged", path: nozomiPath(state, undefined, true) };
    if (positive.length === 1 && positive[0].ns) {
      return { kind: "paged", path: nozomiPath(state, positive[0], true) };
    }
  }

  const idsFor = (term: Term) => {
    if (term.ns === "language") {
      return index.all(nozomiPath({ ...state, language: term.value }));
    }
    return term.ns ? index.all(nozomiPath(state, term)) : index.searchTitle(term.value);
  };

  // Title matches span every language and are only roughly date-ordered, so they
  // start the list only when neither the language nor the sort needs a nozomi file.
  let results: number[];
  const first = positive[0];
  if (
    !first ||
    (!first.ns && (state.orderbykey !== "added" || state.language !== ALL_LANGUAGES))
  ) {
    results = await index.all(nozomiPath(state));
  } else {
    results = await idsFor(positive.shift()!);
    if (!first.ns) results = [...results].sort((a, b) => b - a);
  }

  for (const group of anyOf) {
    const matches = new Set<number>();
    for (const ids of await Promise.all(group.map(idsFor))) {
      for (const id of ids) matches.add(id);
    }
    results = results.filter((id) => matches.has(id));
  }
  for (const ids of await Promise.all(positive.map(idsFor))) {
    const matches = new Set(ids);
    results = results.filter((id) => matches.has(id));
  }
  for (const ids of await Promise.all(negative.map(idsFor))) {
    const excluded = new Set(ids);
    results = results.filter((id) => !excluded.has(id));
  }
  return { kind: "ids", ids: results };
}

/** Gallery id from a hitomi.la gallery/reader URL or an `id:123` query. */
export function parseDeepLinkId(query: string): string | null {
  const text = query.trim();
  const explicit = /^id:\s*(\d+)$/i.exec(text);
  if (explicit) return explicit[1];
  if (!/hitomi\.la\//i.test(text)) return null;
  return /[-/](\d+)\.html/.exec(text)?.[1] ?? null;
}
