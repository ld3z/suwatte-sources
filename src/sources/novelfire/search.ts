import { SearchRequest } from "@suwatte/toolchain";

import { DEFAULT_SORT } from "./constants";

/**
 * Builds the search path. The site has two separate searches: keyword search
 * (no filters) and advanced search (filters, no keyword), so filters only
 * apply when the query is empty.
 */
export function buildSearchPath(request: SearchRequest, page: number): string {
  const query = request.query?.trim() ?? "";
  if (query.length > 0) {
    return `/search?keyword=${encodeURIComponent(query)}&page=${page}`;
  }

  const filters = (request.filters ?? {}) as Record<string, any>;
  const params: [string, string][] = [
    ...(filters.origin?.include ?? []).map((id: string) => ["country_id[]", id]),
    ...(filters.genres?.include ?? []).map((id: string) => ["categories[]", id]),
    // ctgcon and status are required; the site returns no results without them.
    ["ctgcon", filters.genre_mode || "and"],
    ["totalchapter", filters.chapters || "0"],
    ["ratcon", "min"],
    ["rating", filters.min_rating || "0"],
    ["status", filters.status || "-1"],
    ["sort", request.sort?.key || DEFAULT_SORT],
    ["tagcon", "and"],
    ["page", String(page)],
  ];

  const queryString = params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `/search-adv?${queryString}`;
}

/** The part of each search page that holds results; keyword search also lists unrelated popular novels. */
export function searchResultsScope(request: SearchRequest): string {
  return (request.query?.trim() ?? "").length > 0
    ? "#latest-updates ul.novel-list.horizontal"
    : "main";
}
