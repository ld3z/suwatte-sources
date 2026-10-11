import { SearchRequest } from "@suwatte/toolchain";

import { DEFAULT_SORT, PAGE_LIMIT } from "./constants";
import { buildQueryString, excludedIds, selectedIds } from "./utils";

export interface ListOptions {
  sort?: string;
  query?: string;
  genres?: string[];
  excludedGenres?: string[];
  genreMatch?: string;
  status?: string;
}

/** Builds a `/novels` path; the endpoint takes a keyword and filters together. */
export function buildListPath(options: ListOptions, page: number): string {
  const query = options.query?.trim();
  const params = buildQueryString({
    search: query || undefined,
    fuzzy: query ? "1" : undefined,
    genres_include: options.genres?.join(","),
    genres_exclude: options.excludedGenres?.join(","),
    genre_match: options.genreMatch === "any" ? "any" : undefined,
    sort: options.sort,
    status: options.status && options.status !== "all" ? options.status : undefined,
    page,
    per_page: PAGE_LIMIT,
  });
  return `/novels?${params}`;
}

/** Keyword searches default to relevance (no sort) unless a sort is picked. */
export function buildSearchPath(request: SearchRequest, page: number): string {
  const filters = (request.filters ?? {}) as Record<string, any>;
  const query = request.query?.trim();
  return buildListPath(
    {
      sort: request.sort?.key || (query ? undefined : DEFAULT_SORT),
      query,
      genres: selectedIds(filters.genres),
      excludedGenres: excludedIds(filters.genres),
      genreMatch: filters.genre_match,
      status: filters.status,
    },
    page
  );
}
